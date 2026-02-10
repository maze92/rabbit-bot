// src/dashboard/routes/auth.js

function registerAuthRoutes(ctx) {
  const { app, express, requireDashboardAuth, DashboardUserModel, bcrypt, jwt, JWT_SECRET, sanitizeText, rateLimit, ADMIN_PERMISSIONS, GuildConfig, getClient, sanitizeId } = ctx;

  const crypto = require('crypto');

  // Dashboard staff (OAuth) should not be able to manage dashboard users/admins.
  // Keep the rest of the capabilities aligned with the existing admin permissions.
  const VIEWER_PERMISSIONS = Object.freeze({
    canViewLogs: true,
    canViewConfig: true
  });

  const MANAGER_PERMISSIONS = Object.freeze({
    ...(ADMIN_PERMISSIONS || {}),
    canManageUsers: false
  });

  // Back-compat alias (older code refers to STAFF_PERMISSIONS)
  const STAFF_PERMISSIONS = MANAGER_PERMISSIONS;

  function oauthEnabled() {
    return !!(process.env.DISCORD_OAUTH_CLIENT_ID && process.env.DISCORD_OAUTH_CLIENT_SECRET);
  }

  function getRedirectUri(req) {
    // Prefer explicit redirect URI (recommended). Fallback to inferred host.
    return process.env.DISCORD_OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/discord/callback`;
  }

  function parseCookies(req) {
    const header = (req && req.headers && req.headers.cookie) ? String(req.headers.cookie) : '';
    const out = {};
    header.split(';').forEach((part) => {
      const i = part.indexOf('=');
      if (i <= 0) return;
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (!k) return;
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    });
    return out;
  }

  function setCookie(res, name, value, opts = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    parts.push('Path=/');
    if (opts.maxAge != null) parts.push(`Max-Age=${Math.max(0, Number(opts.maxAge) || 0)}`);
    if (opts.httpOnly !== false) parts.push('HttpOnly');
    // Lax keeps the OAuth callback working while protecting most CSRF.
    parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
    if (opts.secure) parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
  }

  function clearCookie(res, name) {
    res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }

  function isSecureRequest(req) {
    // Express w/ trust proxy: req.secure is reliable.
    return !!(req && req.secure);
  }

  // Public status (used by the UI to decide which login UX to show).
  app.get('/api/auth/oauth/status', (req, res) => {
    return res.json({ ok: true, enabled: oauthEnabled() });
  });

  // Discord OAuth2 start
  app.get('/auth/discord', (req, res) => {
    if (!oauthEnabled()) {
      return res.status(400).send('Discord OAuth is not configured. Set DISCORD_OAUTH_CLIENT_ID and DISCORD_OAUTH_CLIENT_SECRET.');
    }

    const state = crypto.randomBytes(16).toString('hex');
    setCookie(res, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(req), maxAge: 300 });

    const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
    const redirectUri = getRedirectUri(req);
    const scope = encodeURIComponent('identify guilds');

    const url =
      'https://discord.com/api/oauth2/authorize' +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      '&response_type=code' +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(state)}`;

    return res.redirect(url);
  });

  // Discord OAuth2 callback
  app.get('/auth/discord/callback', async (req, res) => {
    try {
      if (!oauthEnabled()) {
        return res.status(400).send('Discord OAuth is not configured.');
      }

      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
      const cookies = parseCookies(req);
      const expectedState = cookies.oauth_state || '';
      clearCookie(res, 'oauth_state');

      if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
        return res.status(400).send('Invalid OAuth state. Please try again.');
      }

      const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
      const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;
      const redirectUri = getRedirectUri(req);

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      });

      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenJson || !tokenJson.access_token) {
        console.error('[OAuth] Token exchange failed', tokenRes.status, tokenJson);
        return res.status(400).send('Failed to exchange OAuth code.');
      }

      const accessToken = tokenJson.access_token;

      const meRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const me = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !me || !me.id) {
        console.error('[OAuth] /users/@me failed', meRes.status, me);
        return res.status(400).send('Failed to fetch Discord user.');
      }

      const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const guilds = await guildsRes.json().catch(() => ([]));
      if (!guildsRes.ok || !Array.isArray(guilds)) {
        console.error('[OAuth] /users/@me/guilds failed', guildsRes.status, guilds);
        return res.status(400).send('Failed to fetch Discord guilds.');
      }

      // Only list guilds where:
      //  - the bot is present
      //  - AND the user is OWNER/ADMINISTRATOR OR has a configured staff role for dashboard access.
      const ADMINISTRATOR = 0x8;
      const manageableSet = new Set(
        guilds
          .filter((g) => g && (g.owner === true || ((Number(g.permissions) || 0) & ADMINISTRATOR) === ADMINISTRATOR))
          .map((g) => String(g.id))
      );

      const client = typeof getClient === 'function' ? getClient() : null;
      const botGuildIds = client ? Array.from(client.guilds.cache.keys()).map(String) : [];

      const candidateGuildIds = guilds
        .map((g) => (g && g.id ? String(g.id) : ''))
        .filter(Boolean)
        .filter((id) => botGuildIds.includes(id))
        .slice(0, 200);

      // Helper: read dashboard-access roles from GuildConfig (feature 'config' fallback to staffRoleIds).
      async function getDashboardAccessRoleIds(guildId) {
        if (!GuildConfig || !guildId) return [];
        const gid = typeof sanitizeId === 'function' ? sanitizeId(guildId) : String(guildId);
        if (!gid) return [];
        const doc = await GuildConfig.findOne({ guildId: gid }).lean().catch(() => null);
        if (!doc) return [];

        const byFeat = doc.staffRolesByFeature && Array.isArray(doc.staffRolesByFeature.config)
          ? doc.staffRolesByFeature.config
          : [];
        const base = Array.isArray(doc.staffRoleIds) ? doc.staffRoleIds : [];
        const legacy = (byFeat.length ? byFeat : base).map((x) => String(x)).filter(Boolean);

        const prof = doc.dashboardAccessProfiles || {};
        const profIds = []
          .concat(Array.isArray(prof.viewers) ? prof.viewers : [])
          .concat(Array.isArray(prof.managers) ? prof.managers : [])
          .concat(Array.isArray(prof.admins) ? prof.admins : [])
          .map((x) => String(x))
          .filter(Boolean);

        // Union of all role IDs that grant dashboard access for this guild
        const out = Array.from(new Set(profIds.concat(legacy))).slice(0, 200);
        return out;
      }

      // Helper: check if user has any of the configured roles in that guild.
      async function userHasAnyRole(guildId, roleIds) {
        if (!client || !guildId || !roleIds || !roleIds.length) return false;
        const guild = client.guilds.cache.get(String(guildId));
        if (!guild) return false;
        const member = await guild.members.fetch(String(me.id)).catch(() => null);
        if (!member || !member.roles || !member.roles.cache) return false;
        return member.roles.cache.some((r) => roleIds.includes(String(r.id)));
      }

      const allowedGuildIds = [];
      const remainingGuildIds = [];

      for (const gid of candidateGuildIds) {
        if (manageableSet.has(gid)) {
          allowedGuildIds.push(gid);
        } else {
          remainingGuildIds.push(gid);
        }
      }

      // Batch-load guild configs to reduce Mongo roundtrips when checking role-based access.
      const roleMap = new Map();
      if (GuildConfig && remainingGuildIds.length) {
        const docs = await GuildConfig.find({ guildId: { $in: remainingGuildIds } })
          .select('guildId staffRoleIds staffRolesByFeature dashboardAccessProfiles')
          .lean()
          .catch(() => ([]));

        (docs || []).forEach((doc) => {
          const gid = doc && doc.guildId ? String(doc.guildId) : '';
          if (!gid) return;

          const byFeat = doc.staffRolesByFeature && Array.isArray(doc.staffRolesByFeature.config)
            ? doc.staffRolesByFeature.config
            : [];
          const base = Array.isArray(doc.staffRoleIds) ? doc.staffRoleIds : [];
          const legacy = (byFeat.length ? byFeat : base).map((x) => String(x)).filter(Boolean);

          const prof = doc.dashboardAccessProfiles || {};
          const profIds = []
            .concat(Array.isArray(prof.viewers) ? prof.viewers : [])
            .concat(Array.isArray(prof.managers) ? prof.managers : [])
            .concat(Array.isArray(prof.admins) ? prof.admins : [])
            .map((x) => String(x))
            .filter(Boolean);

          const roleIds = Array.from(new Set(profIds.concat(legacy))).slice(0, 200);
          roleMap.set(gid, roleIds);
        });
      }

      // Concurrency-limited role checks to avoid Discord REST spikes.
      async function mapLimit(arr, limit, fn) {
        const out = new Array(arr.length);
        let i = 0;
        const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
          while (i < arr.length) {
            const idx = i++;
            try {
              out[idx] = await fn(arr[idx], idx);
            } catch {
              out[idx] = null;
            }
          }
        });
        await Promise.all(workers);
        return out;
      }

      const toCheck = remainingGuildIds.filter((gid) => {
        const roleIds = roleMap.get(gid);
        return Array.isArray(roleIds) ? roleIds.length > 0 : true;
      });

      const checks = await mapLimit(toCheck, 5, async (gid) => {
        // Staff-role based access (only if configured)
        const roleIds = roleMap.get(gid) || await getDashboardAccessRoleIds(gid);
        if (!roleIds || !roleIds.length) return null;
        const ok = await userHasAnyRole(gid, roleIds);
        return ok ? gid : null;
      });

      checks.filter(Boolean).forEach((gid) => allowedGuildIds.push(gid));
if (!allowedGuildIds.length) {
        return res.status(403).send('No servers found where the bot is present and you have access (admin or staff role).');
      }

      // OAuth sessions are treated as staff by default (no dashboard user management).
      // Legacy dashboard admins (username/password) remain the only way to manage dashboard users.
      const token = jwt.sign(
        {
          t: 'oauth',
          sub: String(me.id),
          username: String(me.username || 'discord'),
          role: 'MOD',
          profile: 'UNSCOPED',
          selectedGuildId: null,
          permissions: {},
          allowedGuildIds
        },
        JWT_SECRET,
        { expiresIn: '4h' }
      );

      // Return a tiny HTML bridge that stores the dashboard token and returns to the app.
      // (We keep the current dashboard auth model as a JWT stored in localStorage.)
      const firstGuild = allowedGuildIds.length === 1 ? allowedGuildIds[0] : '';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirecting…</title></head>
<body>
<script>
  try {
    localStorage.setItem('DASHBOARD_TOKEN', ${JSON.stringify(token)});
    ${firstGuild ? `localStorage.setItem('DASHBOARD_GUILD_ID', ${JSON.stringify(firstGuild)});` : ''}
  } catch (e) {}
  window.location.replace('/');
</script>
</body></html>`);
    } catch (err) {
      console.error('[OAuth] callback error', err);
      return res.status(500).send('OAuth error.');
    }
  });

  // Select a guild after OAuth login.
  // This mints a "server-scoped" OAuth token with permissions derived from configured role profiles.
  app.post('/api/auth/select-guild', requireDashboardAuth, express.json(), async (req, res) => {
    try {
      const u = req.dashboardUser;
      if (!u || !u.oauth) {
        return res.status(400).json({ ok: false, error: 'OAUTH_REQUIRED' });
      }

      const guildId = sanitizeId((req.body && req.body.guildId) || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'MISSING_GUILD' });

      const allowList = Array.isArray(u.allowedGuildIds) ? u.allowedGuildIds.filter(Boolean).map(String) : [];
      if (allowList.length && !allowList.includes(String(guildId))) {
        return res.status(403).json({ ok: false, error: 'NO_GUILD_ACCESS' });
      }

      const client = typeof getClient === 'function' ? getClient() : null;
      if (!client) return res.status(500).json({ ok: false, error: 'BOT_NOT_READY' });

      const guild = client.guilds.cache.get(String(guildId)) || null;
      if (!guild) return res.status(404).json({ ok: false, error: 'GUILD_NOT_FOUND' });

      const userId = String(u._id || u.id || u.sub || '');
      if (!userId) return res.status(400).json({ ok: false, error: 'MISSING_USER' });

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return res.status(403).json({ ok: false, error: 'NOT_IN_GUILD' });

      const isOwner = guild.ownerId && String(guild.ownerId) === userId;
      let isAdmin = false;
      try {
        isAdmin = isOwner || (member.permissions && typeof member.permissions.has === 'function' && member.permissions.has('Administrator'));
      } catch {
        isAdmin = isOwner;
      }

      const doc = await (GuildConfig ? GuildConfig.findOne({ guildId: String(guildId) }).lean().catch(() => null) : null);

      const prof = (doc && doc.dashboardAccessProfiles) ? doc.dashboardAccessProfiles : {};
      const admins = Array.isArray(prof.admins) ? prof.admins.map(String) : [];
      const managers = Array.isArray(prof.managers) ? prof.managers.map(String) : [];
      const viewers = Array.isArray(prof.viewers) ? prof.viewers.map(String) : [];

      const hasRole = (ids) => {
        if (!ids || !ids.length) return false;
        try {
          return member.roles && member.roles.cache && ids.some((id) => member.roles.cache.has(String(id)));
        } catch {
          return false;
        }
      };

      // Legacy fallback for "config" feature access
      const legacyByFeat = Array.isArray(doc?.staffRolesByFeature?.config) ? doc.staffRolesByFeature.config.map(String) : [];
      const legacyBase = Array.isArray(doc?.staffRoleIds) ? doc.staffRoleIds.map(String) : [];
      const legacy = (legacyByFeat.length ? legacyByFeat : legacyBase).filter(Boolean);

      let profile = 'VIEWER';
      if (isAdmin) profile = 'ADMIN';
      else if (hasRole(admins)) profile = 'ADMIN';
      else if (hasRole(managers)) profile = 'MANAGER';
      else if (hasRole(viewers)) profile = 'VIEWER';
      else if (hasRole(legacy)) profile = 'MANAGER';
      else {
        // If access was revoked between OAuth callback and selection, block.
        return res.status(403).json({ ok: false, error: 'NO_DASHBOARD_ACCESS' });
      }

      const permissions = profile === 'VIEWER' ? VIEWER_PERMISSIONS : MANAGER_PERMISSIONS;

      const token = jwt.sign(
        {
          t: 'oauth',
          sub: userId,
          username: u.username || 'discord',
          role: 'MOD',
          profile,
          selectedGuildId: String(guildId),
          permissions,
          allowedGuildIds: allowList
        },
        JWT_SECRET,
        { expiresIn: '4h' }
      );

      return res.json({ ok: true, token, profile, permissions, selectedGuildId: String(guildId) });
    } catch (err) {
      console.error('[OAuth] select-guild error', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'rl:auth:login:' });

// Usernames for dashboard auth should be simple and predictable to avoid UX/security issues.
function normalizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  const s = sanitizeText(raw, { maxLen: 32, stripHtml: true }).toLowerCase();
  // Allow letters, digits, dot, underscore, dash. Trim anything else.
  const cleaned = s.replace(/[^a-z0-9._-]/g, '');
  return cleaned;
}

function parseAllowedGuildIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    const s = typeof v === 'string' ? v : (v == null ? '' : String(v));
    const id = s.replace(/\D/g, '').slice(0, 20);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= 200) break;
  }
  return out;
}

const PERMISSION_KEYS = Object.freeze([
  ...Object.keys(ADMIN_PERMISSIONS || {}),
  'canManageUsers'
]);

function normalizePermissions(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const k of PERMISSION_KEYS) {
    if (raw[k] === true) out[k] = true;
  }
  return out;
}

app.post('/api/auth/login', express.json(), loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    // Hard type checks to prevent NoSQL operator injection (e.g. {"$gt":""}).
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'MISSING_CREDENTIALS' });
    }

    const safeUsername = normalizeUsername(username);
    const safePassword = password;
    console.log('[Dashboard Auth] Login attempt', safeUsername);

    // Backwards-compatible: keep legacy error code used by the UI.
    if (!safeUsername || !safePassword) {
      return res.status(400).json({ ok: false, error: 'MISSING_CREDENTIALS' });
    }

    const envUser = process.env.DASHBOARD_ADMIN_USER;
    const envPass = process.env.DASHBOARD_ADMIN_PASS;

    // Always query with the sanitized username.
    let user = await DashboardUserModel.findOne({ username: safeUsername }).lean();

    // Se não existir user mas as credenciais batem certo com as envs, cria/admin padrão em runtime.
    if (!user && envUser && envPass && safeUsername === envUser && safePassword === envPass) {
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await DashboardUserModel.create({
        username: safeUsername,
        passwordHash,
        role: 'ADMIN',
        permissions: ADMIN_PERMISSIONS
      });
      user = created.toObject();
      console.log('[Dashboard Auth] Created admin from env on login', safeUsername);
    }

    if (!user) {
      return res.status(401).json({ ok: false, error: 'INVALID_LOGIN' });
    }

    let match = false;
    try {
      match = await bcrypt.compare(password, user.passwordHash || '');
    } catch {
      match = false;
    }

    // Se o hash não coincidir mas as envs batem, atualiza o hash e permite login.
    if (!match && envUser && envPass && safeUsername === envUser && safePassword === envPass) {
      const passwordHash = await bcrypt.hash(password, 10);
      await DashboardUserModel.updateOne({ _id: user._id }, { $set: { passwordHash } }).exec();
      match = true;
      console.log('[Dashboard Auth] Updated admin hash from env on login', safeUsername);
    }

    if (!match) {
      return res.status(401).json({ ok: false, error: 'INVALID_LOGIN' });
    }

    const payload = {
      id: user._id.toString(),
      role: user.role,
      permissions: user.permissions || {},
      username: user.username
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    return res.json({
      ok: true,
      token
    });
  } catch (err) {
    console.error('[Dashboard Auth] login error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.get('/api/auth/me', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  if (!u) {
    return res.status(401).json({ ok: false, error: 'NO_USER' });
  }

  return res.json({
    ok: true,
    user: {
      id: u._id || null,
      username: u.username || 'env-token',
      role: u.role || 'ADMIN',
      permissions: u.permissions || {},
      allowedGuildIds: Array.isArray(u.allowedGuildIds) ? u.allowedGuildIds : [],
      selectedGuildId: u.selectedGuildId || null,
      profile: u.profile || null,
      oauth: !!u.oauth
    }
  });
});

// Create / list users (ADMIN / canManageUsers only).
app.get('/api/auth/users', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  const users = await DashboardUserModel.find({})
    .select('-passwordHash')
    .sort({ username: 1 })
    .lean();

  return res.json({ ok: true, users });
});

app.post('/api/auth/users', requireDashboardAuth, express.json(), async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const { username, password, role, permissions, allowedGuildIds } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
    }

    const safeUsername = normalizeUsername(username);
    if (!safeUsername || safeUsername.length < 3) {
      return res.status(400).json({ ok: false, error: 'INVALID_USERNAME' });
    }

    // Basic password policy (dashboard-only, not Discord)
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ ok: false, error: 'WEAK_PASSWORD' });
    }

    const existing = await DashboardUserModel.findOne({ username: safeUsername }).lean();
    if (existing) {
      return res.status(409).json({ ok: false, error: 'USERNAME_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await DashboardUserModel.create({
      username: safeUsername,
      passwordHash,
      role: role === 'ADMIN' ? 'ADMIN' : 'MOD',
      permissions: normalizePermissions(permissions),
      allowedGuildIds: parseAllowedGuildIds(allowedGuildIds)
    });

    return res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        allowedGuildIds: Array.isArray(user.allowedGuildIds) ? user.allowedGuildIds : []
      }
    });
  } catch (err) {
    console.error('[Dashboard Auth] create user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});


app.patch('/api/auth/users/:id', requireDashboardAuth, express.json(), async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const userId = req.params.id;
    const { role, permissions, allowedGuildIds } = req.body || {};

    const update = {};
    if (role && (role === 'ADMIN' || role === 'MOD')) {
      update.role = role;
    }
    if (permissions && typeof permissions === 'object') {
      update.permissions = normalizePermissions(permissions);
    }
    if (Array.isArray(allowedGuildIds)) {
      update.allowedGuildIds = parseAllowedGuildIds(allowedGuildIds);
    }

    // Avoid empty $set (Mongo treats it as no-op, but keep it explicit)
    if (!Object.keys(update).length) {
      return res.status(400).json({ ok: false, error: 'NO_CHANGES' });
    }

    const updated = await DashboardUserModel.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    ).select('-passwordHash');

    if (!updated) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error('[Dashboard Auth] update user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});


app.delete('/api/auth/users/:id', requireDashboardAuth, async (req, res) => {
  const u = req.dashboardUser;
  const perms = (u && u.permissions) || {};
  const isAdmin = u && u.role === 'ADMIN';
  if (!isAdmin && !perms.canManageUsers) {
    return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
  }

  try {
    const userId = req.params.id;
    const existing = await DashboardUserModel.findById(userId).lean();
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    await DashboardUserModel.deleteOne({ _id: userId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Dashboard Auth] delete user error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

}

module.exports = { registerAuthRoutes };

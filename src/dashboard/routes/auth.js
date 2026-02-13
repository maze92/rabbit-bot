// src/dashboard/routes/auth.js
//
// Discord OAuth2-only authentication.
// Login is allowed for any user with access to at least one guild.
// Authorization is enforced when selecting a guild:
//  - Owner or Administrator permission => ADMIN
//  - Otherwise, the user must have at least one role configured in GuildConfig.staffRoleIds => STAFF
// Bot presence is required for selecting a guild (dashboard operations).

function registerAuthRoutes(ctx) {
  const { app, express, requireDashboardAuth, jwt, JWT_SECRET, sanitizeText, rateLimit, ADMIN_PERMISSIONS, getClient, sanitizeId, GuildConfig } = ctx;

  const crypto = require('crypto');
  const { fetchMember } = require('../../services/discordFetchCache');

  // OAuth robustness: avoid duplicate token exchanges, and gracefully handle Discord global rate limits.
  // Note: in-memory only. If you run multiple replicas, consider a shared store (e.g. Redis) to dedupe across instances.
  const oauthCodeCache = new Map(); // code -> { exp, redirectUrl }
  const oauthInflight = new Map();  // key -> exp
  function nowMs() { return Date.now(); }
  function sweepMaps() {
    const n = nowMs();
    for (const [k, v] of oauthCodeCache.entries()) if (!v || v.exp <= n) oauthCodeCache.delete(k);
    for (const [k, exp] of oauthInflight.entries()) if (!exp || exp <= n) oauthInflight.delete(k);
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function getClientIp(req) {
    const xf = (req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'])) || '';
        const ip = String(Array.isArray(xf) ? xf[0] : xf).split(',')[0].trim() || req.ip || '';
    return ip;
  }
  function inflightKey(req, state) {
    return `${getClientIp(req)}:${String(state || '').slice(0, 64)}`;
  }

  const ADMINISTRATOR = 8n;
  function hasAdministratorPermission(g) {
    try {
      // Discord returns permissions as a string integer (can exceed 2^53).
      const p = typeof g.permissions === 'string' ? BigInt(g.permissions) : BigInt(Number(g.permissions || 0));
      return (p & ADMINISTRATOR) === ADMINISTRATOR;
    } catch {
      return false;
    }
  }


  function oauthEnabled() {
    return !!(process.env.DISCORD_OAUTH_CLIENT_ID && process.env.DISCORD_OAUTH_CLIENT_SECRET);
  }

  function getRedirectUri(req) {
    // Prefer explicit redirect URI (recommended). Fallback to inferred host.
    return process.env.DISCORD_OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/discord/callback`;
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
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
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
    // Clear both Secure and non-Secure variants to avoid stale cookies across proxy/HTTPS edge cases.
    try {
      res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
    } catch {}
    try {
      res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    } catch {}
  }

  function isSecureRequest(req) {
    return !!(req && req.secure);
  }

  // Public status (UI convenience).
  app.get('/api/auth/oauth/status', (req, res) => {
    return res.json({ ok: true, enabled: oauthEnabled(), oauthOnly: true });
  });

  const rlCallback = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:auth:callback:' });

  // Discord OAuth2 start
  app.get('/api/auth/discord', (req, res) => {
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
  app.get('/api/auth/discord/callback', rlCallback, async (req, res) => {
    try {
      if (!oauthEnabled()) return res.status(400).send('Discord OAuth is not configured.');

      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
      sweepMaps();
      // If the callback is invoked twice with the same single-use code, reuse the cached redirect.
      if (code) {
        const cached = oauthCodeCache.get(code);
        if (cached && cached.redirectUrl) {
          if (cached.token) {
            setCookie(res, 'dash_token', cached.token, { httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(req), maxAge: 4 * 60 * 60 });
          }
          return res.redirect(cached.redirectUrl);
        }
      }

      // Prevent parallel token exchanges for the same client/state.
      const lk = inflightKey(req, returnedState);
      if (oauthInflight.has(lk)) {
        const cached = code ? oauthCodeCache.get(code) : null;
        if (cached && cached.redirectUrl) {
          if (cached.token) {
            setCookie(res, 'dash_token', cached.token, { httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(req), maxAge: 4 * 60 * 60 });
          }
          return res.redirect(cached.redirectUrl);
        }
        return res.status(429).send('OAuth is already in progress. Please retry in a few seconds.');
      }
      oauthInflight.set(lk, nowMs() + 15000);

      try {
        const cookies = parseCookies(req);
      const expectedState = cookies.oauth_state || '';
      clearCookie(res, 'oauth_state');

      if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
        return res.status(400).send('Invalid OAuth state. Please try again.');
      }

// Token exchange (handles Discord global rate limits safely).
const redirectUri = getRedirectUri(req);
let tokenJson = null;
let tokenRes = null;

for (let attempt = 0; attempt < 2; attempt++) {
  tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_OAUTH_CLIENT_ID,
      client_secret: process.env.DISCORD_OAUTH_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  });

  if (tokenRes.status === 429) {
    const body = await tokenRes.json().catch(() => ({}));
    const raHeader = tokenRes.headers.get('retry-after');
    const retryAfterSec = Math.max(
      0,
      Number.isFinite(Number(raHeader)) ? Number(raHeader) : 0,
      Number.isFinite(Number(body && body.retry_after)) ? Number(body.retry_after) : 0
    );

    console.warn('[OAuth] Token exchange rate limited (429). retryAfterSec=', retryAfterSec);

    // Do not hold the request open for long. Wait briefly only when the retry window is small.
    if (retryAfterSec > 2) {
      return res.status(429).send('Discord rate limit reached. Please retry shortly.');
    }

    await sleep(Math.ceil((retryAfterSec || 1) * 1000));
    continue;
  }

  tokenJson = await tokenRes.json().catch(() => ({}));
  break;
}

if (!tokenRes || !tokenRes.ok || !tokenJson || !tokenJson.access_token) {
  console.error('[OAuth] Token exchange failed', tokenRes && tokenRes.status, tokenJson);
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

      const client = typeof getClient === 'function' ? getClient() : null;
      // IMPORTANT: Do NOT depend on the bot guild cache being ready here.
      // The allow-list is based on Discord OAuth's /users/@me/guilds response.
      // Bot presence is only enforced later during guild selection.
      const botGuildIds = client && client.guilds && client.guilds.cache
        ? Array.from(client.guilds.cache.keys()).map(String)
        : null;

// Allowed guilds: all guilds returned by Discord OAuth.
// Bot presence is checked later for selection and shown in the guild list.
const allowedGuilds = guilds
  .filter((g) => g && g.id)
  .map((g) => ({
    id: String(g.id),
    name: typeof g.name === 'string' ? g.name : null,
    icon: typeof g.icon === 'string' ? g.icon : null,
    owner: g.owner === true,
    permissions: typeof g.permissions === 'string' ? g.permissions : String(g.permissions || ''),
    botPresent: Array.isArray(botGuildIds) ? botGuildIds.includes(String(g.id)) : null
  }))
  .slice(0, 200);

const allowedGuildIds = allowedGuilds.map((g) => g.id);

// If the user has no guilds, do not create a dashboard session.
if (allowedGuildIds.length === 0) {
  clearCookie(res, 'dash_token');
  const redirectUrl = `/?oauthError=NO_GUILDS`;
  oauthCodeCache.set(code, { exp: nowMs() + 180000, redirectUrl, token: null });
  return res.redirect(redirectUrl);
}


      const safeUsername = sanitizeText(me.username || 'discord', { maxLen: 32, stripHtml: true });

      // Unscoped session: user is authenticated, but must select a guild to gain a scoped profile.
      const perms = Object.assign({}, (ADMIN_PERMISSIONS || {}), { canManageUsers: false });

      const token = jwt.sign(
        {
          t: 'oauth',
          sub: String(me.id),
          username: safeUsername,
          role: 'USER',
          permissions: perms,
          allowedGuildIds,
          allowedGuilds,
          selectedGuildId: null,
          profile: 'UNSCOPED'
        },
        JWT_SECRET,
        { expiresIn: '4h' }
      );

      // Persist token server-side (preferred) so the frontend does not depend on localStorage.
      // Note: fetch calls are same-origin, so cookies are automatically sent.

      // If the user only has one guild, auto-select it by minting a scoped token.
      if (allowedGuildIds.length === 1) {
        const scoped = await mintScopedToken({
          userId: String(me.id),
          username: safeUsername,
          allowedGuildIds,
          allowedGuilds,
          guildId: allowedGuildIds[0]
        }).catch(() => null);
        if (scoped) {
          setCookie(res, 'dash_token', scoped, { httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(req), maxAge: 4 * 60 * 60 });
          const redirectUrl = `/?selectGuild=0`;
          oauthCodeCache.set(code, { exp: nowMs() + 180000, redirectUrl, token: scoped });
          return res.redirect(redirectUrl);
        }
      }

      setCookie(res, 'dash_token', token, { httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(req), maxAge: 4 * 60 * 60 });
      const redirectUrl = `/?selectGuild=1`;
      oauthCodeCache.set(code, { exp: nowMs() + 180000, redirectUrl, token });
      return res.redirect(redirectUrl);
      } finally {
        oauthInflight.delete(lk);
      }
    } catch (err) {
      console.error('[OAuth] Callback error', err);
      return res.status(500).send('OAuth callback failed.');
    }
  });

  async function mintScopedToken({ userId, username, allowedGuildIds, allowedGuilds, guildId }) {
    const gid = sanitizeId(guildId);
    if (!gid) return null;
    const allowed = Array.isArray(allowedGuildIds) ? allowedGuildIds.map(String) : [];
    if (!allowed.includes(String(gid))) return null;

    // Bot presence is required for scoped dashboard operations.
    const client = typeof getClient === 'function' ? getClient() : null;
    const guild = client && client.guilds && client.guilds.cache ? client.guilds.cache.get(String(gid)) : null;
    if (!guild) return null;

    // Determine if the user is owner/admin from the OAuth guild metadata.
    const meta = Array.isArray(allowedGuilds) ? allowedGuilds.find((g) => g && String(g.id) === String(gid)) : null;
    const isOwner = meta && meta.owner === true;
    const isAdmin = meta ? hasAdministratorPermission(meta) : false;

    let profile = 'STAFF';
    let role = 'STAFF';

    if (isOwner || isAdmin) {
      profile = 'ADMIN';
      role = 'ADMIN';
    } else {
      // Role-based access: user must match at least one GuildConfig.staffRoleIds.
      let staffRoleIds = [];
      try {
        if (GuildConfig && typeof GuildConfig.findOne === 'function') {
          const cfg = await GuildConfig.findOne({ guildId: String(gid) }).lean().exec();
          if (cfg && Array.isArray(cfg.staffRoleIds)) staffRoleIds = cfg.staffRoleIds.map(String).filter(Boolean);
        }
      } catch (e) {
        console.error('[OAuth] Failed to read GuildConfig for staffRoleIds', e);
      }

      if (!staffRoleIds.length) return null;

      const member = await fetchMember(guild, String(userId)).catch(() => null);
      if (!member) return null;
      const ok = member.roles && member.roles.cache && member.roles.cache.some((r) => staffRoleIds.includes(r.id));
      if (!ok) return null;
    }

    const perms = Object.assign({}, (ADMIN_PERMISSIONS || {}), { canManageUsers: false });

    return jwt.sign(
      {
        t: 'oauth',
        sub: String(userId),
        username: sanitizeText(username || 'discord', { maxLen: 32, stripHtml: true }),
        role,
        permissions: perms,
        allowedGuildIds: allowed.slice(0, 200),
        selectedGuildId: gid,
        profile
      },
      JWT_SECRET,
      { expiresIn: '4h' }
    );
  }

  const rlSelect = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'rl:auth:select:' });
  app.post('/api/auth/select-guild', requireDashboardAuth, express.json(), rlSelect, async (req, res) => {
    try {
      const u = req.dashboardUser;
      const rawGid = req.body && req.body.guildId ? req.body.guildId : '';
      const gid = sanitizeId(rawGid);
      if (!gid) return res.status(400).json({ ok: false, error: 'MISSING_GUILD_ID' });

      const allowed = Array.isArray(u.allowedGuildIds) ? u.allowedGuildIds.map(String) : [];
      // If the token has no allow-list, force re-auth (prevents selecting arbitrary guilds due to stale tokens).
      if (!allowed.length) {
        return res.status(401).json({ ok: false, error: 'REAUTH_REQUIRED' });
      }

      if (!allowed.includes(String(gid))) {
        return res.status(403).json({ ok: false, error: 'NO_GUILD_ACCESS' });
      }

      // Enforce bot presence for the selected guild.
      // We allow listing guilds even if the bot is not installed, but selection for dashboard operations
      // requires the bot to be present.
      try {
        const client = typeof getClient === 'function' ? getClient() : null;
        const hasGuild = client && client.guilds && client.guilds.cache && client.guilds.cache.has(String(gid));
        if (!hasGuild) {
          return res.status(409).json({ ok: false, error: 'BOT_NOT_INSTALLED' });
        }
      } catch {}

      const token = await mintScopedToken({
        userId: String(u._id || u.sub || u.id || u.userId || ''),
        username: u.username || 'discord',
        allowedGuildIds: allowed,
        allowedGuilds: Array.isArray(u.allowedGuilds) ? u.allowedGuilds : [],
        guildId: gid
      });

      if (!token) {
        return res.status(403).json({ ok: false, error: 'NO_GUILD_ACCESS' });
      }

      // Persist server-side cookie so the UI continues to work even if storage is blocked.
      setCookie(res, 'dash_token', token, { httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(req), maxAge: 4 * 60 * 60 });
      return res.json({ ok: true, token });
    } catch (err) {
      console.error('[OAuth] select-guild error', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/api/auth/me', requireDashboardAuth, async (req, res) => {
    const u = req.dashboardUser;
    if (!u) return res.status(401).json({ ok: false, error: 'NO_USER' });
    return res.json({
      ok: true,
      user: {
        id: u._id || null,
        username: u.username || 'discord',
        role: u.role || 'ADMIN',
        permissions: u.permissions || {},
        allowedGuildIds: Array.isArray(u.allowedGuildIds) ? u.allowedGuildIds : [],
        selectedGuildId: u.selectedGuildId || null,
        profile: u.profile || null,
        oauth: true
      }
    });
  });

  // Logout: clear auth cookies so the user can recover from stale tokens without manual cookie deletion.
  const rlLogout = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:auth:logout:' });
  app.post('/api/auth/logout', rlLogout, (req, res) => {
    try {
      clearCookie(res, 'dash_token');
      clearCookie(res, 'oauth_state');
    } catch {}
    return res.json({ ok: true });
  });

  // Convenience GET for simple button links (still rate limited).
  app.get('/api/auth/logout', rlLogout, (req, res) => {
    try {
      clearCookie(res, 'dash_token');
      clearCookie(res, 'oauth_state');
    } catch {}
    return res.redirect('/');
  });
}

module.exports = { registerAuthRoutes };

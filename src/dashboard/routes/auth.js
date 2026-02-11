// src/dashboard/routes/auth.js
//
// Discord OAuth2-only authentication.
// Only Discord guild Owners or users with Administrator permission may access the dashboard,
// and only for guilds where the bot is present.

function registerAuthRoutes(ctx) {
  const { app, express, requireDashboardAuth, jwt, JWT_SECRET, sanitizeText, rateLimit, ADMIN_PERMISSIONS, getClient, sanitizeId } = ctx;

  const crypto = require('crypto');

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
    res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }

  function isSecureRequest(req) {
    return !!(req && req.secure);
  }

  // Public status (UI convenience).
  app.get('/api/auth/oauth/status', (req, res) => {
    return res.json({ ok: true, enabled: oauthEnabled(), oauthOnly: true });
  });

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
  app.get('/api/auth/discord/callback', async (req, res) => {
    try {
      if (!oauthEnabled()) return res.status(400).send('Discord OAuth is not configured.');

      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
      const cookies = parseCookies(req);
      const expectedState = cookies.oauth_state || '';
      clearCookie(res, 'oauth_state');

      if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
        return res.status(400).send('Invalid OAuth state. Please try again.');
      }

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_OAUTH_CLIENT_ID,
          client_secret: process.env.DISCORD_OAUTH_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: getRedirectUri(req)
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

      const client = typeof getClient === 'function' ? getClient() : null;
      const botGuildIds = client ? Array.from(client.guilds.cache.keys()).map(String) : [];

      const ADMINISTRATOR = 0x8;

      // Allowed guilds: bot is present AND user is owner/admin.
      const allowedGuildIds = guilds
        .filter((g) => g && g.id && botGuildIds.includes(String(g.id)))
        .filter((g) => (g.owner === true) || (((Number(g.permissions) || 0) & ADMINISTRATOR) === ADMINISTRATOR))
        .map((g) => String(g.id))
        .slice(0, 200);

      const safeUsername = sanitizeText(me.username || 'discord', { maxLen: 32, stripHtml: true });

      const perms = Object.assign({}, (ADMIN_PERMISSIONS || {}), { canManageUsers: false });

      const token = jwt.sign(
        {
          t: 'oauth',
          sub: String(me.id),
          username: safeUsername,
          role: 'ADMIN',
          permissions: perms,
          allowedGuildIds,
          selectedGuildId: null,
          profile: 'UNSCOPED'
        },
        JWT_SECRET,
        { expiresIn: '4h' }
      );

      // If the user only has one guild, auto-select it by minting a scoped token.
      if (allowedGuildIds.length === 1) {
        const scoped = await mintScopedToken({ userId: String(me.id), username: safeUsername, allowedGuildIds, guildId: allowedGuildIds[0] }).catch(() => null);
        if (scoped) {
          return res.redirect(`/?token=${encodeURIComponent(scoped)}&selectGuild=0`);
        }
      }

      return res.redirect(`/?token=${encodeURIComponent(token)}&selectGuild=1`);
    } catch (err) {
      console.error('[OAuth] Callback error', err);
      return res.status(500).send('OAuth callback failed.');
    }
  });

  async function mintScopedToken({ userId, username, allowedGuildIds, guildId }) {
    const gid = sanitizeId(guildId);
    if (!gid) return null;
    const allowed = Array.isArray(allowedGuildIds) ? allowedGuildIds.map(String) : [];
    if (!allowed.includes(String(gid))) return null;

    // IMPORTANT: In admin/owner-only mode, the OAuth callback already filtered allowedGuildIds to:
    // - bot is present in the guild
    // - user is owner OR has Administrator permission
    // Re-validating via guild.members.fetch() introduces fragile failures (intents/REST/race).
    // Here we only enforce the allow-list and mint a scoped token.

    const perms = Object.assign({}, (ADMIN_PERMISSIONS || {}), { canManageUsers: false });

    return jwt.sign(
      {
        t: 'oauth',
        sub: String(userId),
        username: sanitizeText(username || 'discord', { maxLen: 32, stripHtml: true }),
        role: 'ADMIN',
        permissions: perms,
        allowedGuildIds: allowed.slice(0, 200),
        selectedGuildId: gid,
        profile: 'ADMIN'
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
      if (!allowed.includes(String(gid))) {
        return res.status(403).json({ ok: false, error: 'NO_GUILD_ACCESS' });
      }

      const token = await mintScopedToken({
        userId: String(u._id || u.sub || u.id || u.userId || ''),
        username: u.username || 'discord',
        allowedGuildIds: allowed,
        guildId: gid
      });

      if (!token) {
        return res.status(403).json({ ok: false, error: 'NO_GUILD_ACCESS' });
      }

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
}

module.exports = { registerAuthRoutes };

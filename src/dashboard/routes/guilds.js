// src/dashboard/routes/guilds.js

const { ChannelType } = require('discord.js');

/**
 * Guild-related routes used by the dashboard UI:
 * - list guilds
 * - guild meta (channels + roles)
 * - text channels
 */
function registerGuildsRoutes({
  app,
  requireDashboardAuth,
  requireGuildAccess,
  getClient,
  sanitizeId
}) {
  // List guilds
  app.get('/api/guilds', requireDashboardAuth, async (req, res) => {
    try {
      const _client = getClient();
      // We may not have a ready client cache yet; fall back to the allow-list from OAuth token.
      // If neither exists, return empty list.

      // Allow-list per authenticated dashboard user.
      // In OAuth-only mode we still restrict "ADMIN" users to their allowed guilds
      // (owner/admin on Discord + bot present) via allowedGuildIds.
      const u = req.dashboardUser;
      const allowList = u && Array.isArray(u.allowedGuildIds)
        ? u.allowedGuildIds.filter(Boolean).map(String)
        : [];

      // OAuth-only: if token has no allow-list, force re-auth (prevents stale/empty tokens from persisting).
      if (u && u.oauth && allowList.length === 0) {
        return res.status(401).json({ ok: false, error: 'REAUTH_REQUIRED' });
      }

      // Prefer token metadata (from /users/@me/guilds) for stable listing even if client cache is not ready.
      const allowedMeta = (u && Array.isArray(u.allowedGuilds))
        ? u.allowedGuilds.filter((g) => g && g.id && allowList.includes(String(g.id)))
        : [];

      const clientGuilds = _client && _client.guilds && _client.guilds.cache
        ? _client.guilds.cache
        : null;

      const items = (allowedMeta.length ? allowedMeta : allowList.map((id) => ({ id, name: null, icon: null })))
        .map((g) => {
          const cg = clientGuilds ? clientGuilds.get(String(g.id)) : null;
          return {
            id: String(g.id),
            name: (cg && cg.name) ? cg.name : (typeof g.name === 'string' ? g.name : String(g.id)),
            icon: typeof g.icon === 'string' ? g.icon : null,
            botPresent: !!cg,
            memberCount:
              cg && typeof cg.memberCount === 'number'
                ? cg.memberCount
                : cg && typeof cg.approximateMemberCount === 'number'
                  ? cg.approximateMemberCount
                  : null
          };
        });
      items.sort((a, b) => a.name.localeCompare(b.name));
      return res.json({ ok: true, items });
    } catch (err) {
      console.error('[Dashboard] /api/guilds error:', err);
      return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });

  // Guild metadata for dashboard UI (channels + roles)
  const guardGuildParam = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'params', key: 'guildId' })
    : (req, res, next) => next();

  app.get('/api/guilds/:guildId/meta', requireDashboardAuth, guardGuildParam, async (req, res) => {
    try {
      const _client = getClient();
      if (!_client) return res.json({ ok: true, channels: [], roles: [] });

      const guildId = sanitizeId(req.params.guildId);
      const guild = _client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

      const channels =
        guild.channels?.cache
          ?.filter(
            (c) =>
              c &&
              (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
          )
          .map((c) => ({ id: c.id, name: c.name, type: c.type }))
          .sort((a, b) => a.name.localeCompare(b.name)) || [];


      const voiceChannels =
        guild.channels?.cache
          ?.filter((c) => c && (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice))
          .map((c) => ({ id: c.id, name: c.name, type: c.type }))
          .sort((a, b) => a.name.localeCompare(b.name)) || [];

      const categories =
        guild.channels?.cache
          ?.filter((c) => c && c.type === ChannelType.GuildCategory)
          .map((c) => ({ id: c.id, name: c.name, type: c.type }))
          .sort((a, b) => a.name.localeCompare(b.name)) || [];

      const roles =
        guild.roles?.cache
          ?.filter((r) => r && r.id !== guild.id && !r.managed)
          .map((r) => ({ id: r.id, name: r.name, position: r.position }))
          .sort((a, b) => b.position - a.position) || [];

      return res.json({ ok: true, channels, roles, voiceChannels, categories });
    } catch (err) {
      console.error('[Dashboard] /api/guilds/:guildId/meta error:', err);
      return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });

  // List text-based channels (used by some selectors)
  app.get('/api/guilds/:guildId/channels', requireDashboardAuth, guardGuildParam, async (req, res) => {
    try {
      const _client = getClient();
      if (!_client) return res.json({ ok: true, items: [] });

      const guildId = sanitizeId(req.params.guildId);
      if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

      const guild = _client.guilds.cache.get(guildId) || null;
      if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

      const items = guild.channels.cache
        .filter((ch) => ch && ch.isTextBased?.() && !ch.isDMBased?.())
        .map((ch) => ({ id: ch.id, name: ch.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return res.json({ ok: true, items });
    } catch (err) {
      console.error('[Dashboard] /api/guilds/:guildId/channels error:', err);
      return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });
}

module.exports = { registerGuildsRoutes };

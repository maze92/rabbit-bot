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
      if (!_client) return res.json({ ok: true, items: [] });

      // Optional allow-list per dashboard user (MOD only).
      const u = req.dashboardUser;
      const allowList = u && u.role !== 'ADMIN' && Array.isArray(u.allowedGuildIds) ? u.allowedGuildIds.filter(Boolean).map(String) : [];

      let guilds = _client.guilds.cache.map((g) => g);
      if (allowList.length) {
        guilds = guilds.filter((g) => g && allowList.includes(String(g.id)));
      }

      const items = guilds.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount:
          typeof g.memberCount === 'number'
            ? g.memberCount
            : typeof g.approximateMemberCount === 'number'
              ? g.approximateMemberCount
              : null
      }));
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

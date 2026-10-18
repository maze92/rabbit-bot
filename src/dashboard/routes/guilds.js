// src/dashboard/routes/guilds.js

const { sendServerError } = require('./_errors');
const { ChannelType } = require('discord.js');
const { getGuild, getCachedChannel } = require('../../services/guildService');
const { isBotOperator } = require('../botRoles');

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
      // Guild admins are revalidated against Discord permissions; bot admins
      // use the signed allow-list assembled from servers with the bot installed.
      const u = req.dashboardUser;

      // Backwards-compatibility: older sessions may contain an unfiltered allow-list.
      // Prefer (and re-validate) OAuth metadata whenever available.
      function hasAdministratorPermission(permissions) {
        try {
          // Discord "Administrator" bit = 0x8
          const perm = BigInt(String(permissions || '0'));
          return (perm & BigInt(0x8)) === BigInt(0x8);
        } catch (e) {
          return false;
        }
      }

      const metaAll = (u && Array.isArray(u.allowedGuilds))
        ? u.allowedGuilds.filter((g) => g && g.id)
        : [];

      const strictEligibleFromMeta = isBotOperator(u)
        ? (Array.isArray(u.allowedGuildIds) ? u.allowedGuildIds.map(String) : [])
        : metaAll
            .filter((g) => Boolean(g.owner) || hasAdministratorPermission(g.permissions))
            .map((g) => String(g.id));

      const allowList = strictEligibleFromMeta.length
        ? strictEligibleFromMeta
        : (u && Array.isArray(u.allowedGuildIds)
          ? u.allowedGuildIds.filter(Boolean).map(String)
          : []);

      // OAuth-only: if token has no allow-list, force re-auth (prevents stale/empty tokens from persisting).
      if (u && u.oauth && allowList.length === 0 && !isBotOperator(u)) {
        return res.json({ ok: true, items: [], reason: 'NO_ELIGIBLE_GUILDS' });
      }

      // Prefer token metadata (from /users/@me/guilds) for stable listing even if client cache is not ready.
      const allowedMeta = metaAll.filter((g) => allowList.includes(String(g.id)));

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
      return sendServerError(res, '/api/guilds', err);
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
      const guild = getGuild(_client, guildId);
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
      return sendServerError(res, '/api/guilds/:guildId/meta', err);
    }
  });

  // List text-based channels (used by some selectors)
  app.get('/api/guilds/:guildId/channels', requireDashboardAuth, guardGuildParam, async (req, res) => {
    try {
      const _client = getClient();
      if (!_client) return res.json({ ok: true, items: [] });

      const guildId = sanitizeId(req.params.guildId);
      if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

      const guild = getGuild(_client, guildId) || null;
      if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

      // Include parent/category + channel type info so dashboards can group/pin channels.
      const items = guild.channels.cache
        .filter((ch) => ch && ch.isTextBased?.() && !ch.isDMBased?.())
        .map((ch) => {
          const parentId = ch.parentId || null;
          const parent = parentId ? getCachedChannel(_client, guildId, parentId) : null;
          const parentName = parent && parent.name ? String(parent.name) : null;

          // Normalize a lightweight "kind" used by UI pickers.
          // discord.js v14 types are numeric; we avoid importing enums here.
          const rawType = ch.type;
          const isThread = !!ch.isThread?.();
          // GuildAnnouncement is 5 in discord.js v14 (ChannelType.GuildAnnouncement)
          const isAnnouncement = (rawType === 5) || (String(rawType).toLowerCase().includes('announcement'));
          const kind = isThread ? 'thread' : (isAnnouncement ? 'announcement' : 'text');

          return {
            id: ch.id,
            name: ch.name,
            parentId,
            parentName,
            kind,
          };
        })
        .sort((a, b) => {
          const pa = (a.parentName || '').toLowerCase();
          const pb = (b.parentName || '').toLowerCase();
          if (pa !== pb) return pa.localeCompare(pb);
          const ka = (a.kind || '').toLowerCase();
          const kb = (b.kind || '').toLowerCase();
          if (ka !== kb) return ka.localeCompare(kb);
          return String(a.name || '').localeCompare(String(b.name || ''));
        });

      return res.json({ ok: true, items });
    } catch (err) {
      return sendServerError(res, '/api/guilds/:guildId/channels', err);
    }
  });
}

module.exports = { registerGuildsRoutes };

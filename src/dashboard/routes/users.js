// src/dashboard/routes/users.js

const rateLimit = require('../../systems/rateLimit');

/**
 * Users routes (Dashboard -> Users tab)
 *
 * Discord cache is used by default (fast, avoids gateway spam).
 * Full member sync is opt-in (sync=1) and guarded.
 */
function registerUsersRoutes({
  app,
  requireDashboardAuth,
  requireGuildAccess,
  requirePerm,
  getClient,
  sanitizeId,
  guildMembersLastFetch,
  infractionsService,
  TicketLogModel
}) {
  const guardGuildParam = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'params', key: 'guildId' })
    : (req, res, next) => next();

  const canViewUsers = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canManageUsers', 'canViewLogs', 'canActOnCases'] })
    : (req, res, next) => next();
  function mapMemberRoles(member, guild) {
    try {
      // Hide @everyone (same id as guild) and managed/integration roles.
      return (
        member?.roles?.cache
          ?.filter((r) => r && r.id !== guild.id && !r.managed)
          .map((r) => ({ id: r.id, name: r.name })) ||
        []
      );
    } catch {
      return [];
    }
  }

  // Guild members (for Users tab) - paginated + optional search
  app.get(
    '/api/guilds/:guildId/users',
    requireDashboardAuth,
    canViewUsers,
    guardGuildParam,
    rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'rl:users:list:' }),
    async (req, res) => {
      try {
        const _client = getClient();
        if (!_client) return res.json({ ok: true, page: 1, limit: 50, total: 0, items: [] });

        const guildId = sanitizeId(req.params.guildId);
        if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

        const guild = _client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

        const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
        const limitRaw = parseInt(req.query.limit || '50', 10);
        const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 10), 200);

        const search = (req.query.search || '').toString().trim();
        const sync = String(req.query.sync || '') === '1';

        // Sync mode (explicit): full fetch, but guarded to avoid gateway spam.
        // If within cooldown, skip the fetch but still return cached results (avoid 429 UX).
        const now = Date.now();
        const last = guildMembersLastFetch.get(guildId) || 0;
        const canSync = (now - last) >= 2 * 60 * 1000;

        if (sync && canSync) {
          try {
            await guild.members.fetch();
            guildMembersLastFetch.set(guildId, Date.now());
          } catch (e) {
            console.warn('[Dashboard] Failed to sync member list for guild', guildId, e);
          }
        }

        // Auto-warm cache once if empty and the user did not request search.
        // This prevents "no users until I press Sync" for large guilds.
        if (!sync && !search && guild.members.cache.size === 0 && canSync) {
          try {
            await guild.members.fetch();
            guildMembersLastFetch.set(guildId, Date.now());
          } catch (e) {
            console.warn('[Dashboard] Failed to warm member cache for guild', guildId, e);
          }
        }

        // Search mode: use Discord query fetch when possible (faster than full list)
        if (search) {
          let items = [];
          const q = search.toLowerCase();

          try {
            const coll = await guild.members.fetch({ query: search, limit: Math.min(limit, 100) });
            items = coll.map((m) => ({
              id: m.id,
              username: m.user?.username || null,
              discriminator: m.user?.discriminator || null,
              tag: m.user?.tag || null,
              bot: !!m.user?.bot,
              joinedAt: m.joinedAt || null,
              roles: mapMemberRoles(m, guild)
            }));
          } catch (e) {
            // Fallback to cache search
            items = guild.members.cache
              .filter((m) => {
                const tag = (m.user?.tag || '').toLowerCase();
                const username = (m.user?.username || '').toLowerCase();
                const id = (m.id || '').toLowerCase();
                return tag.includes(q) || username.includes(q) || id.includes(q);
              })
              .map((m) => ({
                id: m.id,
                username: m.user?.username || null,
                discriminator: m.user?.discriminator || null,
                tag: m.user?.tag || null,
                bot: !!m.user?.bot,
                joinedAt: m.joinedAt || null,
                roles: mapMemberRoles(m, guild)
              }));
          }

          items.sort((a, b) => {
            const an = (a.username || a.tag || '').toLowerCase();
            const bn = (b.username || b.tag || '').toLowerCase();
            return an.localeCompare(bn) || String(a.id).localeCompare(String(b.id));
          });

          const total = items.length;
          const start = (page - 1) * limit;
          const end = start + limit;
          return res.json({ ok: true, page, limit, total, items: items.slice(start, end) });
        }

        // Default listing: cache-based + paginated
        let items = guild.members.cache.map((m) => ({
          id: m.id,
          username: m.user?.username || null,
          discriminator: m.user?.discriminator || null,
          tag: m.user?.tag || null,
          bot: !!m.user?.bot,
          joinedAt: m.joinedAt || null,
          roles: mapMemberRoles(m, guild)
        }));

        items.sort((a, b) => {
          const an = (a.username || '').toLowerCase();
          const bn = (b.username || '').toLowerCase();
          return an.localeCompare(bn) || String(a.id).localeCompare(String(b.id));
        });

        const total = items.length;
        const start = (page - 1) * limit;
        const end = start + limit;
        return res.json({ ok: true, page, limit, total, items: items.slice(start, end) });
      } catch (err) {
        console.error('[Dashboard] /api/guilds/:guildId/users error:', err);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
      }
    }
  );

  // User history (infractions + tickets)
  app.get('/api/guilds/:guildId/users/:userId/history', requireDashboardAuth, canViewUsers, guardGuildParam, async (req, res) => {
    try {
      const guildId = sanitizeId(req.params.guildId);
      const userId = sanitizeId(req.params.userId);
      if (!guildId || !userId) {
        return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
      }

      if (!infractionsService) {
        return res.status(503).json({ ok: false, error: 'Infractions service not available' });
      }

      const [infractions, counts, ticketDocs] = await Promise.all([
        infractionsService.getRecentInfractions(guildId, userId, 10),
        infractionsService.countInfractionsByType(guildId, userId),
        TicketLogModel
          ? TicketLogModel.find({ guildId, userId }).sort({ createdAt: -1 }).limit(10).lean()
          : Promise.resolve([])
      ]);

      const tickets = (ticketDocs || []).map((t) => ({
        ticketNumber: t.ticketNumber,
        createdAt: t.createdAt || null,
        closedAt: t.closedAt || null
      }));

      return res.json({
        ok: true,
        infractions: infractions || [],
        counts: counts || {},
        tickets
      });
    } catch (err) {
      console.error('[Dashboard] /api/guilds/:guildId/users/:userId/history error:', err);
      return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });
}

module.exports = { registerUsersRoutes };

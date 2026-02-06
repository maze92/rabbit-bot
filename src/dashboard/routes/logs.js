// src/dashboard/routes/logs.js

module.exports = {
  registerLogsRoutes
};

function registerLogsRoutes(opts) {
  const {
    app,
    requireDashboardAuth,
    rateLimit,
    sanitizeId,
    recordAudit,
    getActorFromRequest,
    LogsQuerySchema,
    _getModels,
    _getLogsCache,
    _setLogsCache
  } = opts;

  if (!app) throw new Error('registerLogsRoutes: app is required');

  // List logs (DB-backed if available, otherwise in-memory)
  app.get('/api/logs', requireDashboardAuth, async (req, res) => {
    const parsed = LogsQuerySchema.safeParse(req.query || {});
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid query' });

    try {
      const page = Math.max(parseInt(req.query.page || '1', 10), 1);
      const limitRaw = parseInt(req.query.limit || '50', 10);
      const limit = Math.min(Math.max(limitRaw, 1), 200);

      const search = (req.query.search || '').toString().trim();
      const type = (req.query.type || '').toString().trim().toLowerCase();
      const guildId = (req.query.guildId || '').toString().trim();

      const { DashboardLog, TicketLog } = (_getModels && _getModels()) || {};

      // Special mode: ticket logs
      if (type === 'tickets') {
        if (!TicketLog) {
          return res.status(503).json({ ok: false, error: 'TicketLog model not available' });
        }

        const qTickets = {};
        if (guildId) qTickets.guildId = guildId;

        if (search) {
          const s = search.toString();
          qTickets.$or = [
            { username: { $regex: s, $options: 'i' } },
            { userId: { $regex: s, $options: 'i' } }
          ];
        }

        const total = await TicketLog.countDocuments(qTickets);
        const docs = await TicketLog
          .find(qTickets)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();

        const items = docs.map((doc) => {
          const opened = doc.createdAt ? new Date(doc.createdAt) : null;
          const closed = doc.closedAt ? new Date(doc.closedAt) : null;

          let description = '';
          if (opened && !isNaN(opened.getTime())) {
            description += `Aberto em ${opened.toLocaleString()}`;
          }
          if (closed && !isNaN(closed.getTime())) {
            description += `${description ? ' • ' : ''}Fechado em ${closed.toLocaleString()}`;
          } else {
            description += (description ? ' • ' : '') + 'Em aberto';
          }

          return {
            title: `Ticket #${String(doc.ticketNumber).padStart(3, '0')} • ${doc.username || doc.userId}`,
            description,
            user: {
              id: doc.userId,
              tag: doc.username || doc.userId
            },
            executor: doc.closedById
              ? { id: doc.closedById, tag: doc.closedByUsername || doc.closedById }
              : null,
            guild: {
              id: doc.guildId,
              name: null
            },
            createdAt: doc.createdAt,
            time: doc.createdAt ? new Date(doc.createdAt).toISOString() : null
          };
        });

        return res.json({
          ok: true,
          source: 'tickets',
          page,
          limit,
          total,
          items
        });
      }

      // Fallback to in-memory cache if DashboardLog is not available
      if (!DashboardLog) {
        let filtered = (_getLogsCache ? _getLogsCache() : []) || [];
        filtered = filtered.slice();

        if (guildId) filtered = filtered.filter((l) => l?.guild?.id === guildId);
        if (type) filtered = filtered.filter((l) => (l.title || '').toLowerCase().includes(type));

        if (search) {
          const s = search.toLowerCase();
          filtered = filtered.filter((l) => JSON.stringify(l || {}).toLowerCase().includes(s));
        }

        const total = filtered.length;
        const start = (page - 1) * limit;
        const end = start + limit;
        const items = filtered.slice(start, end);

        return res.json({ ok: true, page, limit, total, items });
      }

      const q = {};
      if (guildId) q['guild.id'] = guildId;
      if (type) q.title = { $regex: type, $options: 'i' };
      if (search) q.$text = { $search: search };

      const total = await DashboardLog.countDocuments(q);
      const docs = await DashboardLog
        .find(q)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return res.json({ ok: true, page, limit, total, items: docs });
    } catch (err) {
      console.error('[Dashboard] /api/logs error:', err);
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // Clear logs
  app.post(
    '/api/logs/clear',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'rl:logs:clear:' }),
    async (req, res) => {
      try {
        const guildId = sanitizeId(req.body.guildId || '');
        if (!guildId) return res.status(400).json({ ok: false, error: 'Missing guildId' });

        const { DashboardLog } = (_getModels && _getModels()) || {};

        if (DashboardLog) {
          await DashboardLog.deleteMany({ 'guild.id': guildId });
        }

        const cache = (_getLogsCache ? _getLogsCache() : []) || [];
        const next = cache.filter((l) => l?.guild?.id !== guildId);
        if (_setLogsCache) _setLogsCache(next);

        await recordAudit({
          req,
          action: 'logs.clear',
          guildId,
          actor: getActorFromRequest(req),
          payload: { guildId }
        });

        return res.json({ ok: true });
      } catch (err) {
        console.error('[Dashboard] /api/logs/clear error:', err);
        return res.status(500).json({ ok: false, error: 'Internal error' });
      }
    }
  );

  // Export logs to CSV (supports same filters as /api/logs)
  app.get('/api/logs/export.csv', requireDashboardAuth, async (req, res) => {
    try {
      const guildId = (req.query.guildId || '').toString().trim();
      const type = (req.query.type || '').toString().trim().toLowerCase();
      const search = (req.query.search || '').toString().trim();

      const limit = 5000;
      let items = [];

      const { DashboardLog, TicketLog } = (_getModels && _getModels()) || {};

      // Ticket export mode
      if (type === 'tickets') {
        if (!TicketLog) {
          return res.status(503).json({ ok: false, error: 'TicketLog model not available' });
        }

        const qTickets = {};
        if (guildId) qTickets.guildId = guildId;

        if (search) {
          const s = search.toString();
          qTickets.$or = [
            { username: { $regex: s, $options: 'i' } },
            { userId: { $regex: s, $options: 'i' } }
          ];
        }

        const docs = await TicketLog
          .find(qTickets)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        items = docs.map((doc) => ({
          createdAt: doc.createdAt,
          title: `Ticket #${String(doc.ticketNumber).padStart(3, '0')} • ${doc.username || doc.userId}`,
          description: doc.subject || '',
          userId: doc.userId,
          username: doc.username || '',
          executorId: doc.closedById || '',
          executorTag: doc.closedByUsername || ''
        }));
      } else if (!DashboardLog) {
        let filtered = (_getLogsCache ? _getLogsCache() : []) || [];
        filtered = filtered.slice();
        if (guildId) filtered = filtered.filter((l) => l?.guild?.id === guildId);
        if (type) filtered = filtered.filter((l) => (l.title || '').toLowerCase().includes(type));
        if (search) {
          const s = search.toLowerCase();
          filtered = filtered.filter((l) => JSON.stringify(l || {}).toLowerCase().includes(s));
        }
        items = filtered.slice(0, limit);
      } else {
        const q = {};
        if (guildId) q['guild.id'] = guildId;
        if (type) q.title = { $regex: type, $options: 'i' };
        if (search) q.$text = { $search: search };

        items = await DashboardLog
          .find(q)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
      }

      const header = ['createdAt', 'title', 'description', 'userId', 'username', 'executorId', 'executorTag'];
      const lines = [header.join(',')];
      for (const it of items) {
        const row = [
          it.createdAt ? new Date(it.createdAt).toISOString() : '',
          (it.title || '').replace(/"/g, '""'),
          (it.description || '').replace(/"/g, '""'),
          it.userId || '',
          it.username || '',
          it.executorId || '',
          it.executorTag || ''
        ].map((v) => '"' + String(v).replace(/\n/g, ' ').replace(/\r/g, ' ') + '"');
        lines.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="logs-export.csv"');
      return res.send(lines.join('\n'));
    } catch (err) {
      console.error('[Dashboard] /api/logs/export.csv error:', err);
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });
}

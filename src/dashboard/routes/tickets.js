// src/dashboard/routes/tickets.js

module.exports = {
  registerTicketsRoutes
};

function registerTicketsRoutes(opts) {
  const {
    app,
    requireDashboardAuth,
    rateLimit,
    sanitizeText,
    getActorFromRequest,
    recordAudit,
    _getClient,
    _getModels
  } = opts;

  if (!app) throw new Error('registerTicketsRoutes: app is required');

  // -----------------------------
  // List tickets (dashboard)
  // GET /api/tickets?guildId=...&status=open|closed|all&q=...&limit=...&cursor=...
  // -----------------------------
  app.get(
    '/api/tickets',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'rl:tickets:list:' }),
    async (req, res) => {
      try {
        const { TicketModel, TicketLogModel } = _getModels ? _getModels() : {};
        if (!TicketModel) return res.status(503).json({ ok: false, error: 'Ticket model not available' });

        const guildId = (req.query.guildId || '').toString().trim();
        if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

        const statusRaw = (req.query.status || 'open').toString().trim().toLowerCase();
        const status = statusRaw === 'all' ? 'all' : (statusRaw === 'closed' ? 'closed' : 'open');
        const q = (req.query.q || '').toString().trim();
        const cursor = (req.query.cursor || '').toString().trim();

        let limit = Number(req.query.limit || 50);
        if (!Number.isFinite(limit) || limit <= 0) limit = 50;
        limit = Math.max(1, Math.min(200, Math.floor(limit)));

        const query = { guildId };
        if (status !== 'all') query.status = status;
        const and = [];

        if (q) {
          // Basic search: ticketNumber exact, userId exact, username/subject partial
          const or = [];
          const asNum = Number(q);
          if (Number.isFinite(asNum) && asNum > 0) or.push({ ticketNumber: asNum });
          if (/^\d{10,32}$/.test(q)) or.push({ userId: q });
          const re = new RegExp(escapeRegExp(q), 'i');
          or.push({ username: re });
          or.push({ subject: re });
          and.push({ $or: or });
        }

        // Cursor pagination (deterministic): we sort by createdAt desc, then _id desc.
        if (cursor) {
          const parts = cursor.split('|');
          const cursorDate = parts[0] ? new Date(parts[0]) : null;
          const cursorId = parts[1] || null;
          if (cursorDate && !Number.isNaN(cursorDate.getTime()) && cursorId) {
            and.push({
              $or: [
                { createdAt: { $lt: cursorDate } },
                { createdAt: cursorDate, _id: { $lt: cursorId } }
              ]
            });
          } else if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
            query.createdAt = { $lt: cursorDate };
          }
        }

        if (and.length) query.$and = and;

        const items = await TicketModel.find(query)
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit)
          .lean();

        let nextCursor = null;
        if (items && items.length === limit) {
          const last = items[items.length - 1];
          const d = last && last.createdAt ? new Date(last.createdAt) : null;
          if (d && !Number.isNaN(d.getTime()) && last && last._id) {
            nextCursor = `${d.toISOString()}|${last._id}`;
          }
        }

        return res.json({ ok: true, items, nextCursor });
      } catch (err) {
        console.error('[Dashboard] GET /api/tickets error:', err);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
      }
    }
  );

  // -----------------------------
  // Ticket audit/timeline (dashboard)
  // GET /api/tickets/:ticketId/audit?guildId=...
  // Uses Ticket + TicketLog as a lightweight timeline.
  // -----------------------------
  app.get(
    '/api/tickets/:ticketId/audit',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 240, keyPrefix: 'rl:tickets:audit:' }),
    async (req, res) => {
      try {
        const { TicketModel, TicketLogModel } = _getModels ? _getModels() : {};
        if (!TicketModel) return res.status(503).json({ ok: false, error: 'Ticket model not available' });

        const ticketId = (req.params.ticketId || '').toString().trim();
        if (!ticketId) return res.status(400).json({ ok: false, error: 'ticketId is required' });

        const ticket = await TicketModel.findById(ticketId).lean();
        if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket not found' });

        const guildId = (req.query.guildId || ticket.guildId || '').toString().trim();
        if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

        const items = [];
        // Open event
        if (ticket.createdAt) {
          items.push({
            action: 'opened',
            createdAt: new Date(ticket.createdAt).toISOString(),
            actorId: ticket.userId || null,
            actorUsername: ticket.username || null
          });
        }

        // Closed event (from Ticket or TicketLog)
        let closedAt = ticket.closedAt || null;
        let closedByUsername = ticket.closedByUsername || null;
        let closedById = ticket.closedById || null;
        if ((!closedAt || !closedByUsername) && TicketLogModel) {
          try {
            const log = await TicketLogModel.findOne({ $or: [{ ticketId: ticket._id }, { channelId: ticket.channelId }] })
              .sort({ createdAt: -1 })
              .lean();
            if (log) {
              closedAt = closedAt || log.closedAt;
              closedByUsername = closedByUsername || log.closedByUsername;
              closedById = closedById || log.closedById;
            }
          } catch (e) {}
        }

        if (closedAt) {
          items.push({
            action: 'closed',
            createdAt: new Date(closedAt).toISOString(),
            actorId: closedById || null,
            actorUsername: closedByUsername || null
          });
        }

        // Ensure chronological
        items.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return ta - tb;
        });

        return res.json({ ok: true, items });
      } catch (err) {
        console.error('[Dashboard] GET /api/tickets/:ticketId/audit error:', err);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
      }
    }
  );

  // -----------------------------
  // Ticket messages (for dashboard view)
  // GET /api/tickets/:ticketId/messages?guildId=...&limit=...
  // Returns the most recent messages from the ticket thread.
  // -----------------------------
  app.get(
    '/api/tickets/:ticketId/messages',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 240, keyPrefix: 'rl:tickets:msgs:' }),
    async (req, res) => {
      try {
        const { TicketModel, TicketLogModel } = _getModels ? _getModels() : {};
        if (!TicketModel) return res.status(503).json({ ok: false, error: 'Ticket model not available' });

        const ticketId = (req.params.ticketId || '').toString().trim();
        if (!ticketId) return res.status(400).json({ ok: false, error: 'ticketId is required' });

        const ticket = await TicketModel.findById(ticketId).lean();
        if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket not found' });

        const guildId = (req.query.guildId || req.body?.guildId || ticket.guildId || '').toString().trim();
        if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

        let limit = Number(req.query.limit || 25);
        if (!Number.isFinite(limit) || limit <= 0) limit = 25;
        limit = Math.max(1, Math.min(50, Math.floor(limit)));

        const client = _getClient ? _getClient() : null;
        if (!client) return res.status(503).json({ ok: false, error: 'Discord client not available' });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ ok: false, error: 'Guild not found' });

        const channelId = ticket.channelId;
        if (!channelId) return res.status(400).json({ ok: false, error: 'Ticket channelId is missing' });

        // Fetch the thread channel and its recent messages.
        let ch = guild.channels.cache.get(channelId) || null;
        if (!ch) {
          try {
            ch = await guild.channels.fetch(channelId);
          } catch (e) {
            ch = null;
          }
        }
        if (!ch || !ch.messages || typeof ch.messages.fetch !== 'function') {
          return res.status(404).json({ ok: false, error: 'Ticket thread not accessible' });
        }

        const msgs = await ch.messages.fetch({ limit });
        const items = Array.from(msgs.values())
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          // Hide bot/system noise by default so operators see the user's context.
          .filter((m) => {
            if (!m) return false;
            const raw = (m.content || '').toString().trim();
            if (!raw) return false;

            // Hide generic bot/system noise, but KEEP dashboard staff replies.
            const isBot = !!(m.author && m.author.bot);
            if (isBot) {
              const pfxA = 'Resposta da equipa:';
              const pfxB = '**Resposta da equipa:**';
              return raw.startsWith(pfxA) || raw.startsWith(pfxB);
            }
            return true;
          })
          .map((m) => {
            const authorUsername = m.author ? (m.author.username || '') : '';
            const authorId = m.author ? m.author.id : '';
            const raw = (m.content || '').toString();
            const pfxA = 'Resposta da equipa:';
            const pfxB = '**Resposta da equipa:**';
            const trimmed = raw.trim();
            const isStaffReply = trimmed.startsWith(pfxA) || trimmed.startsWith(pfxB);
            let rawForDisplay = raw;
            if (isStaffReply) {
              if (trimmed.startsWith(pfxB)) rawForDisplay = trimmed.slice(pfxB.length).trimStart();
              else rawForDisplay = trimmed.slice(pfxA.length).trimStart();
            }
            const clean = sanitizeText
              ? sanitizeText(rawForDisplay, { maxLen: 2000, stripHtml: true })
              : rawForDisplay.slice(0, 2000);
            return {
              id: m.id,
              authorId,
              authorUsername,
              isBot: !!(m.author && m.author.bot),
              isStaffReply: !!isStaffReply,
              createdAt: m.createdAt ? m.createdAt.toISOString() : null,
              content: clean
            };
          });

        return res.json({ ok: true, items });
      } catch (err) {
        console.error('[Dashboard] GET /api/tickets/:ticketId/messages error:', err);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
      }
    }
  );

  // -----------------------------
  // Close/reopen ticket
  // -----------------------------
  app.post(
    '/api/tickets/:ticketId/close',
    requireDashboardAuth,
    // Keep UX smooth: allow normal operator usage without tripping 429 on repeated clicks.
    // Still protected by global /api limiter + per-IP keying.
    rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'rl:tickets:close:' }),
    async (req, res) => {
      try {
        const { TicketModel, TicketLogModel } = _getModels ? _getModels() : {};
        if (!TicketModel) return res.status(503).json({ ok: false, error: 'Ticket model not available' });

        const ticketId = (req.params.ticketId || '').toString().trim();
        if (!ticketId) return res.status(400).json({ ok: false, error: 'ticketId is required' });

        const ticket = await TicketModel.findById(ticketId).lean();
        if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket not found' });

        const guildId = (req.body?.guildId || ticket.guildId || '').toString().trim();
        if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

        const actor = (getActorFromRequest && getActorFromRequest(req)) || 'dashboard';
        const closedAt = new Date();

        // Update DB
        await TicketModel.updateOne(
          { _id: ticketId },
          {
            $set: {
              status: 'closed',
              closedAt,
              closedById: actor,
              closedByUsername: actor
            }
          }
        );

        // Keep legacy analytics consistent: TicketLog is used by /api/mod/overview.
        if (TicketLogModel) {
          try {
            await TicketLogModel.updateOne(
              { $or: [{ ticketId: ticketId }, { channelId: ticket.channelId }] },
              { $set: { closedAt, closedById: actor, closedByUsername: actor } }
            );
          } catch (e) {}
        }

        // Try to archive/lock thread
        const client = _getClient ? _getClient() : null;
        if (client) {
          const guild = client.guilds.cache.get(guildId);
          const channelId = ticket.channelId;
          const ch = guild?.channels?.cache?.get(channelId);
          if (ch && typeof ch.setArchived === 'function') {
            try {
              await ch.setLocked(true, 'Closed via dashboard');
            } catch (e) {}
            try {
              await ch.setArchived(true, 'Closed via dashboard');
            } catch (e) {}
          }
        }

        if (recordAudit) {
          await recordAudit({
            req,
            action: 'ticket.close',
            guildId,
            targetUserId: ticket.userId,
            actor,
            payload: { ticketId }
          });
        }

        return res.json({ ok: true });
      } catch (err) {
        console.error('[Dashboard] POST /api/tickets/:ticketId/close error:', err);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
      }
    }
  );

  app.post(
    '/api/tickets/:ticketId/reopen',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'rl:tickets:reopen:' }),
    async (req, res) => {
      try {
        const { TicketModel, TicketLogModel } = _getModels ? _getModels() : {};
        if (!TicketModel) return res.status(503).json({ ok: false, error: 'Ticket model not available' });

        const ticketId = (req.params.ticketId || '').toString().trim();
        if (!ticketId) return res.status(400).json({ ok: false, error: 'ticketId is required' });

        const ticket = await TicketModel.findById(ticketId).lean();
        if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket not found' });

        const guildId = (req.body?.guildId || ticket.guildId || '').toString().trim();
        if (!guildId) return res.status(400).json({ ok: false, error: 'guildId is required' });

        const actor = (getActorFromRequest && getActorFromRequest(req)) || 'dashboard';

        await TicketModel.updateOne(
          { _id: ticketId },
          {
            $set: {
              status: 'open',
              closedAt: null,
              closedById: null,
              closedByUsername: null
            }
          }
        );

        if (TicketLogModel) {
          try {
            await TicketLogModel.updateOne(
              { $or: [{ ticketId: ticketId }, { channelId: ticket.channelId }] },
              { $set: { closedAt: null, closedById: null, closedByUsername: null } }
            );
          } catch (e) {}
        }

        const client = _getClient ? _getClient() : null;
        if (client) {
          const guild = client.guilds.cache.get(guildId);
          const channelId = ticket.channelId;
          const ch = guild?.channels?.cache?.get(channelId);
          if (ch && typeof ch.setArchived === 'function') {
            try {
              await ch.setArchived(false, 'Reopened via dashboard');
            } catch (e) {}
            try {
              await ch.setLocked(false, 'Reopened via dashboard');
            } catch (e) {}
          }
        }

        if (recordAudit) {
          await recordAudit({
            req,
            action: 'ticket.reopen',
            guildId,
            targetUserId: ticket.userId,
            actor,
            payload: { ticketId }
          });
        }

        return res.json({ ok: true });
      } catch (err) {
        console.error('[Dashboard] POST /api/tickets/:ticketId/reopen error:', err);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
      }
    }
  );

  // Reply to a ticket from the dashboard
  app.post(
    '/api/tickets/:ticketId/reply',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 240, keyPrefix: 'rl:tickets:reply:' }),
    async (req, res) => {
      try {
        const { TicketModel } = _getModels ? _getModels() : {};
        if (!TicketModel) {
          return res.status(503).json({ ok: false, error: 'Ticket model not available' });
        }

        const ticketId = (req.params.ticketId || '').toString().trim();
        const rawGuildId = (req.body?.guildId || '').toString().trim();
        const content = sanitizeText ? sanitizeText(req.body?.content || '', { maxLen: 2000, stripHtml: true }) : (req.body?.content || '').toString().slice(0, 2000);

        if (!ticketId) {
          return res.status(400).json({ ok: false, error: 'ticketId is required' });
        }
        if (!content) {
          return res.status(400).json({ ok: false, error: 'content is required' });
        }

        const ticket = await TicketModel.findById(ticketId).lean();
        if (!ticket) {
          return res.status(404).json({ ok: false, error: 'Ticket not found' });
        }

        const guildId = rawGuildId || (ticket.guildId || '');
        if (!guildId) {
          return res.status(400).json({ ok: false, error: 'guildId is required' });
        }

        const client = _getClient ? _getClient() : null;
        if (!client) {
          return res.status(503).json({ ok: false, error: 'Client not available' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          return res.status(404).json({ ok: false, error: 'Guild not found' });
        }

        const channelId = ticket.channelId;
        if (!channelId) {
          return res.status(404).json({ ok: false, error: 'Ticket channel not found' });
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased?.()) {
          return res.status(404).json({ ok: false, error: 'Ticket channel not found or not text-based' });
        }

        const actor = (getActorFromRequest && getActorFromRequest(req)) || 'dashboard';
        // Make staff replies visually distinct in Discord while still allowing the dashboard
        // to detect and show them (see /messages filtering).
        const prefix = '**Resposta da equipa:**';

        await channel.send(`${prefix}\n${content}`);

        try {
          await TicketModel.updateOne(
            { _id: ticketId },
            {
              $set: {
                lastMessageAt: new Date(),
                lastResponderId: actor,
                lastResponderName: actor,
                lastResponderAt: new Date()
              }
            }
          );
        } catch (e) {
          console.warn('[Dashboard] Failed to update ticket lastMessageAt:', e?.message || e);
        }

        if (recordAudit) {
          await recordAudit({
            req,
            action: 'ticket.reply',
            guildId,
            targetUserId: ticket.userId,
            actor,
            payload: { ticketId }
          });
        }

        return res.json({ ok: true });
      } catch (err) {
        console.error('[Dashboard] /api/tickets/:ticketId/reply error:', err);
        return res.status(500).json({ ok: false, error: 'Internal Server Error' });
      }
    }
  );
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

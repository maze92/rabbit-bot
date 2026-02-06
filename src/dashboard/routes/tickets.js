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

  // Reply to a ticket from the dashboard
  app.post(
    '/api/tickets/:ticketId/reply',
    requireDashboardAuth,
    rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'rl:tickets:reply:' }),
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
        const prefix = '[Dashboard reply]';

        await channel.send(`${prefix} ${content}`);

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

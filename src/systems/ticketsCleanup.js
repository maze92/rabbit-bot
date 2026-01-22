// src/systems/ticketsCleanup.js
// Limpeza automática de tickets fechados (apaga canal + registo após X tempo)

const config = require('../config/defaultConfig');
const Ticket = require('../database/models/Ticket');

function startTicketsCleanup(client) {
  if (!client || !Ticket) return;

  const intervalMs = 5 * 60 * 1000; // verifica a cada 5 minutos

  setInterval(async () => {
    try {
      const auto = config.tickets?.autoDeleteClosed;
      if (!auto?.enabled) return;

      const delayMs = Number(auto.delayMs || 0);
      if (!Number.isFinite(delayMs) || delayMs <= 0) return;

      const cutoff = new Date(Date.now() - delayMs);

      const candidates = await Ticket.find({
        status: 'CLOSED',
        closedAt: { $lte: cutoff }
      }).limit(50);

      if (!candidates.length) return;

      for (const ticket of candidates) {
        try {
          const guild = client.guilds.cache.get(ticket.guildId);
          if (guild && ticket.channelId) {
            const channel = guild.channels.cache.get(ticket.channelId) ||
              (await guild.channels.fetch(ticket.channelId).catch(() => null));
            if (channel) {
              await channel.delete('Ticket auto-clean (fechado há demasiado tempo)').catch(() => null);
            }
          }
        } catch (err) {
          console.warn('[ticketsCleanup] Falha ao limpar canal de ticket:', err?.message || err);
        }

        // Remover registo da base de dados
        try {
          await Ticket.deleteOne({ _id: ticket._id }).catch(() => null);
        } catch (err) {
          console.warn('[ticketsCleanup] Falha ao remover ticket da BD:', err?.message || err);
        }
      }
    } catch (err) {
      console.error('[ticketsCleanup] erro no loop:', err);
    }
  }, intervalMs).unref();
}

module.exports = {
  startTicketsCleanup
};


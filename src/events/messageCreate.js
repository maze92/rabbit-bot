// src/events/messageCreate.js

const config = require('../config/defaultConfig');
const autoModeration = require('../systems/autoModeration');
const antiSpam = require('../systems/antiSpam');

let UserActivity = null;
try { UserActivity = require('../database/models/UserActivity'); } catch {}
const mongoose = require('../database/connect');

function getDayStartUtc(d = new Date()) {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  return day;
}

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      if (!message) return;

      // Garantir que a mensagem está completa (caso seja partial)
      if (message.partial) {
        try {
          await message.fetch();
        } catch {
          return;
        }
      }

      // Ignorar DMs, bots e mensagens sem autor
      if (!message.guild) return;
      if (!message.author || message.author.bot) return;

      const content = message.content;
      if (!content || typeof content !== 'string') return;

      // Activity tracking (used by the dashboard panel "Utilizadores Online")
      if (UserActivity && mongoose?.connection?.readyState === 1) {
        const day = getDayStartUtc(new Date());
        UserActivity.updateOne(
          { guildId: message.guild.id, userId: message.author.id, day },
          { $inc: { messages: 1 }, $set: { updatedAt: new Date() } },
          { upsert: true }
        ).catch(() => null);
      }

      // A partir daqui: apenas moderação automática (AutoMod + AntiSpam).
      // Toda a moderação manual é feita via comandos slash (/warn, /mute, ...).
      if (config?.autoModeration?.enabled !== false) {
        await autoModeration(message, client);
      }

      if (config?.antiSpam?.enabled !== false) {
        await antiSpam(message, client);
      }
    } catch (err) {
      console.error('[messageCreate] Critical error:', err);
    }
  });
};


// src/events/messageReactionAdd.js

const {
  handleTicketOpen,
  handleTicketClose,
  OPEN_EMOJI,
  CLOSE_EMOJI
} = require('../systems/ticketThreads');

let GuildConfig = null;
try {
  GuildConfig = require('../database/models/GuildConfig');
} catch (err) {
  console.warn('[messageReactionAdd] GuildConfig model not available:', err);
}

/**
 * Verifica se a reação foi feita no canal configurado para tickets desta guild.
 * @param {impor'discord.js'.Message} message
 */
async function isTicketChannel(message) {
  if (!message || !message.guild) return false;
  const guildId = message.guild.id;
  const channelId = message.channelId;
  if (!guildId || !channelId) return false;
  if (!GuildConfig) return false;

  try {
    const doc = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
    if (doc && doc.ticketThreadChannelId) {
      return doc.ticketThreadChannelId === channelId;
    }
  } catch (err) {
    console.error('[messageReactionAdd] Failed to load GuildConfig for tickets:', err);
  }
  return false;
}

module.exports = (client) => {
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      if (!reaction || !reaction.message) return;
      if (user && user.bot) return;

      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (err) {
          console.warn('[messageReactionAdd] Failed to fetch partial reaction:', err);
          return;
        }
      }

      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch (err) {
          console.warn('[messageReactionAdd] Failed to fetch partial message:', err);
          return;
        }
      }

      const emojiName = reaction.emoji.name || reaction.emoji.id;
      if (!emojiName) return;

      // Abrir ticket: reação no canal configurado com o emoji de abertura
      if (emojiName === OPEN_EMOJI) {
        const ok = await isTicketChannel(reaction.message);
        if (!ok) return;
        await handleTicketOpen(reaction, user);

        // Remover a reação do utilizador após criar o ticket,
        // para que possa abrir um novo ticket com um único clique da próxima vez.
        try {
          await reaction.users.remove(user.id);
        } catch (err) {
          console.error('[messageReactionAdd] Failed to remove user reaction after creating ticket:', err);
        }
        return;
      }

      // Fechar ticket: reação dentro da thread no emoji de fecho
      if (emojiName === CLOSE_EMOJI) {
        return handleTicketClose(reaction, user);
      }
    } catch (err) {
      console.error('[messageReactionAdd] Error:', err);
    }
  });
};

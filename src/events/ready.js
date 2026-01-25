// src/events/ready.js

let started = false;

const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');
const { startMaintenance } = require('../systems/maintenance');

let GuildConfig = null;
try {
  GuildConfig = require('../database/models/GuildConfig');
} catch (err) {
  console.warn('[ready] GuildConfig model not available:', err);
}

let OPEN_EMOJI = '🎫';
try {
  const ticketThreads = require('../systems/ticketThreads');
  if (ticketThreads && ticketThreads.OPEN_EMOJI) {
    OPEN_EMOJI = ticketThreads.OPEN_EMOJI;
  }
} catch (err) {
  // Se falhar, usamos o default
}

/**
 * Garante que existe uma mensagem de suporte no canal de tickets configurado
 * para a guild, com o emoji configurado para abertura de tickets.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 */
async function ensureTicketSupportMessage(client, guild) {
  if (!client || !client.user) return;
  if (!GuildConfig || !guild) return;

  try {
    const cfg = await GuildConfig.findOne({ guildId: guild.id }).lean().catch(() => null);
    if (!cfg || !cfg.ticketThreadChannelId) return;

    const channel = guild.channels.cache.get(cfg.ticketThreadChannelId);
    if (!channel || !channel.isTextBased || !channel.isTextBased()) return;

    // Verificar se já existe uma mensagem recente do bot com este título
    let existing = null;
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      existing = messages.find((m) => {
        if (!m.author || m.author.id !== client.user.id) return false;
        if (!m.embeds || !m.embeds.length) return false;
        const embed = m.embeds[0];
        return embed && embed.title === '📩 Suporte & Tickets';
      });
    } catch (err) {
      // Não é crítico; se não conseguirmos ler, tentamos criar
      console.warn('[ready] Failed to inspect existing support messages:', err);
    }

    if (existing) {
      // Garante que tem o emoji correto
      const hasReaction = existing.reactions.cache.has(OPEN_EMOJI);
      if (!hasReaction) {
        await existing.react(OPEN_EMOJI).catch(() => {});
      }
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📩 Suporte & Tickets')
      .setDescription(
        [
          'Se precisares de ajuda com o servidor, tiveres dúvidas sobre moderação ou quiseres reportar um problema, podes abrir um ticket de suporte.',
          '',
          '👉 **Como abrir um ticket:**',
          `1. Reage a esta mensagem com ${OPEN_EMOJI};`,
          '2. Será criada uma thread privada contigo e com a equipa de suporte;',
          '3. Explica a situação com o máximo de detalhe possível para acelerar a resposta.',
          '',
          '⏱️ Os pedidos são tratados por ordem de chegada. Agradecemos a tua compreensão.'
        ].join('\n')
      )
      .setFooter({ text: 'Utiliza este canal apenas para pedidos relacionados com suporte.' })
      .setTimestamp();

    const sent = await channel.send({ embeds: [embed] });
    await sent.react(OPEN_EMOJI).catch(() => {});
  } catch (err) {
    console.error('[ready] ensureTicketSupportMessage error:', err);
  }
}

/**
 * Percorre todas as guilds ligadas e garante a mensagem de suporte
 * no canal configurado de cada uma.
 */
async function setupTicketSupportMessages(client) {
  if (!client || !client.guilds) return;

  const guilds = Array.from(client.guilds.cache.values());
  for (const guild of guilds) {
    await ensureTicketSupportMessage(client, guild);
  }
}

module.exports = (client) => {
  const setPresenceSafe = async () => {
    if (!client.user) return;

    try {
      await client.user.setPresence({
        activities: [{ name: 'moderating the server', type: 3 }],
        status: 'online'
      });
    } catch (err) {
      console.error('[ready] Failed to set presence:', err);
    }
  };

  client.once('clientReady', async () => {
    if (started) return;
    started = true;

    console.log(`[Bot] Logged in as ${client.user && client.user.tag ? client.user.tag : 'unknown user'}`);

    // Inicia tarefas de manutenção periódicas (limpeza de infrações/logs antigos)
    startMaintenance(config);

    // Garante mensagens de suporte nos canais configurados
    await setupTicketSupportMessages(client);

    await setPresenceSafe();
  });

  client.on('shardResume', async () => {
    await setPresenceSafe();
  });
};

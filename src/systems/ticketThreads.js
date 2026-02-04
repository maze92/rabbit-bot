// src/systems/ticketThreads.js
// Sistema de tickets baseado em threads + reações.

const { EmbedBuilder, ChannelType } = require('discord.js');
const TicketLog = require('../database/models/TicketLog');
const { isStaff } = require('../utils/staff');

// Emoji a usar para abrir tickets
const OPEN_EMOJI = '🎫';
// Emoji para fechar tickets dentro da thread
const CLOSE_EMOJI = '🔒';

/**
 * Cria uma nova thread de ticket a partir da mensagem-base
 * quando alguém reage com o emoji de abertura.
 * @param {impor'discord.js'.MessageReaction} reaction
 * @param {impor'discord.js'.User} user
 */
async function handleTicketOpen(reaction, user) {
  try {
    if (!reaction || !reaction.message) return;
    if (!user || user.bot) return;

    const message = reaction.message;
    const guild = message.guild;
    if (!guild) return;

    const emojiName = reaction.emoji.name || reaction.emoji.id;
    if (!emojiName || emojiName !== OPEN_EMOJI) return;

    // Buscar último ticket desta guild para incrementar numeração
    const last = await TicketLog.findOne({ guildId: guild.id })
      .sort({ ticketNumber: -1 })
      .lean();

    const ticketNumber = last ? last.ticketNumber + 1 : 1;
    const ticketName = `ticket-${String(ticketNumber).padStart(3, '0')}`;

    // Criar thread privada no canal (não ligada diretamente à mensagem base)
    const parentChannel = message.channel;
    const thread = await parentChannel.threads.create({
      name: ticketName,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 1440, // 24h
      reason: `Ticket aberto por ${user.tag || user.id}`
    });

    // Adicionar o utilizador que abriu o ticket
    await thread.members.add(user.id).catch(() => {});

    // Registar log
    await TicketLog.create({
      ticketNumber,
      guildId: guild.id,
      userId: user.id,
      username: user.username || user.tag || user.id
    });

    // Embed de boas-vindas dentro da thread
    const embed = new EmbedBuilder()
      .setTitle('🎫 Ticket de suporte')
      .setDescription(
        [
          `Olá ${user}, obrigado por entrares em contacto com a equipa de suporte.`,
          '',
          '📌 **Antes de começares:**',
          '• Explica de forma clara o teu problema ou pedido;',
          '• Sempre que possível, inclui prints, IDs ou exemplos;',
          '• Evita partilhar dados pessoais sensíveis em texto ou imagem.',
          '',
          `🔒 **Para encerrar este ticket**, reage a esta mensagem com o emoji ${CLOSE_EMOJI}.`,
        ].join('\n')
      )
      .addFields(
        {
          name: 'Número do ticket',
          value: `\`${String(ticketNumber).padStart(3, '0')}\``,
          inline: true
        },
        {
          name: 'Aberto por',
          value: `${user} (\`${user.tag}\`)`,
          inline: true
        }
      )
      .setFooter({ text: `Ticket #${String(ticketNumber).padStart(3, '0')}` })
      .setTimestamp();

    const controlMessage = await thread.send({ embeds: [embed] });

    // Adicionar reação de fecho
    await controlMessage.react(CLOSE_EMOJI).catch(() => {});
  } catch (err) {
    console.error('[ticketThreads] handleTicketOpen error:', err);
  }
}

/**
 * Fecha uma thread de ticket quando alguém reage com o emoji de fechar.
 * @param {impor'discord.js'.MessageReaction} reaction
 * @param {impor'discord.js'.User} user
 */
async function handleTicketClose(reaction, user) {
  try {
    const message = reaction.message;
    const channel = message.channel;

    if (!channel || !channel.isThread || !channel.isThread()) return;
    if (!channel.name || !channel.name.startsWith('ticket-')) return;
    if (!user || user.bot) return;

    const guild = channel.guild;
    if (!guild) return;

    const emojiName = reaction.emoji.name || reaction.emoji.id;
    if (!emojiName || emojiName !== CLOSE_EMOJI) return;

    // Verificar permissões
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const canClose = await isStaff(member).catch(() => false);

    if (!canClose) {
      await channel.send(
        `${user}, não tens permissão para fechar este ticket.`
      ).catch(() => {});
      return;
    }

    // Extrair número do ticket a partir do nome da thread
    const ticketNumberStr = channel.name.replace('ticket-', '');
    const ticketNumber = parseInt(ticketNumberStr, 10);

    if (!Number.isNaN(ticketNumber)) {
      await TicketLog.findOneAndUpdate(
        { guildId: guild.id, ticketNumber },
        {
          $set: {
            closedAt: new Date(),
            closedById: user.id,
            closedByUsername: user.username || user.tag || user.id
          }
        }
      ).catch(() => {});
    }

    await channel.send(`🔒 Ticket fechado por ${user}. Obrigado pelo contacto.`)
      .catch(() => {});

    await channel.setLocked(true, 'Ticket encerrado').catch(() => {});
    await channel.setArchived(true, 'Ticket arquivado').catch(() => {});
  } catch (err) {
    console.error('[ticketThreads] handleTicketClose error:', err);
  }
}

module.exports = {
  handleTicketOpen,
  handleTicketClose,
  OPEN_EMOJI,
  CLOSE_EMOJI
};

// src/systems/ticketThreads.js
// Sistema de tickets baseado em threads + reações.

const { EmbedBuilder, ChannelType } = require('discord.js');
const TicketLog = require('../database/models/TicketLog');
const Ticket = require('../database/models/Ticket');
const TicketCounter = require('../database/models/TicketCounter');
const { isStaff } = require('../utils/staff');
const { fetchMember } = require('../services/discordFetchCache');

const recentTicketOpens = new Map();
const RECENT_OPEN_WINDOW_MS = 5000;

function isRecentOpen(key) {
  const ts = recentTicketOpens.get(key);
  if (!ts) return false;
  if (Date.now() - ts > RECENT_OPEN_WINDOW_MS) {
    recentTicketOpens.delete(key);
    return false;
  }
  return true;
}

function markRecentOpen(key) {
  recentTicketOpens.set(key, Date.now());
}

async function getNextTicketNumber(guildId) {
  // Ensure the counter starts from the current max ticketNumber + 1.
  // This avoids collisions when there are already tickets in the DB
  // but the counter document doesn't exist yet (fresh deploy, new model, etc.).
  const existingCounter = await TicketCounter.findOne({ guildId }).lean();
  if (!existingCounter) {
    const maxTicket = await Ticket.findOne({ guildId })
      .sort({ ticketNumber: -1 })
      .select('ticketNumber')
      .lean();
    const startFrom = (maxTicket && typeof maxTicket.ticketNumber === 'number')
      ? Math.max(1, maxTicket.ticketNumber + 1)
      : 1;
    // Upsert without increment: set the initial value only if missing.
    await TicketCounter.updateOne(
      { guildId },
      { $setOnInsert: { nextTicketNumber: startFrom } },
      { upsert: true }
    );
  }

  // Allocate one number atomically. We store the "next" value in the doc,
  // so the allocated ticketNumber is (nextTicketNumber - 1).
  const doc = await TicketCounter.findOneAndUpdate(
    { guildId },
    { $inc: { nextTicketNumber: 1 } },
    { new: true }
  ).lean();

  const next = doc && typeof doc.nextTicketNumber === 'number' ? doc.nextTicketNumber : 2;
  return Math.max(1, next - 1);
}

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
    if (!emojiName || emojiName !== OPEN_EMOJI) return;// Anti-duplicate: the same reaction event can arrive twice.
const dedupeKey = `${guild.id}:${user.id}:${message.id}`;
if (isRecentOpen(dedupeKey)) return;
markRecentOpen(dedupeKey);

// If this user already has an open ticket, don't create a new one.
const existing = await Ticket.findOne({ guildId: guild.id, userId: user.id, status: 'open' }).lean();
if (existing && existing.channelId) {
  try {
    const ch = await guild.channels.fetch(existing.channelId).catch(() => null);
    if (ch) {
      await ch.send({ content: `Já existe um ticket aberto para ti: <#${existing.channelId}>` }).catch(() => {});
    }
  } catch (e) {}
  return;
}

// Generate sequential ticket number atomically per guild
const ticketNumber = await getNextTicketNumber(guild.id);
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

    // Persistir ticket (para dashboard e replies)
    // We retry a few times in case of a rare race on ticketNumber.
    let ticketDoc;
    let createdTicketNumber = ticketNumber;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        ticketDoc = await Ticket.create({
          ticketNumber: createdTicketNumber,
          guildId: guild.id,
          channelId: thread.id,
          userId: user.id,
          username: user.username || user.tag || user.id,
          status: 'open',
          createdAt: new Date(),
          lastMessageAt: new Date()
        });
        break;
      } catch (err) {
        const isDup = err && (err.code === 11000 || String(err.message || '').includes('E11000'));
        if (!isDup) throw err;

        // If it's a duplicate open-ticket for the same user, just archive the thread.
        const msg = String(err.message || '');
        const isDupOpenTicket = msg.includes('guildId_1_userId_1_status_1');
        if (isDupOpenTicket) {
          try { await thread.setArchived(true, 'Duplicate open ticket'); } catch (e) {}
          return;
        }

        // Otherwise assume it's a ticketNumber collision; allocate a new number and rename the thread.
        createdTicketNumber = await getNextTicketNumber(guild.id);
        const newName = `ticket-${String(createdTicketNumber).padStart(3, '0')}`;
        try { await thread.setName(newName).catch(() => {}); } catch (e) {}
        // Continue loop and retry create.
      }
    }

    if (!ticketDoc) {
      try { await thread.setArchived(true, 'Failed to create ticket'); } catch (e) {}
      return;
    }

    // Registar log (mantido por compatibilidade, agora com ligações)
    await TicketLog.create({
      ticketNumber: createdTicketNumber,
      ticketId: ticketDoc._id,
      guildId: guild.id,
      channelId: thread.id,
      userId: user.id,
      username: user.username || user.tag || user.id,
      createdAt: new Date()
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
    const member = await fetchMember(guild, user.id);
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

    const closedAt = new Date();

    if (!Number.isNaN(ticketNumber)) {
      await TicketLog.findOneAndUpdate(
        { guildId: guild.id, ticketNumber },
        {
          $set: {
            closedAt,
            closedById: user.id,
            closedByUsername: user.username || user.tag || user.id
          }
        }
      ).catch(() => {});

      // Update persistent ticket
      await Ticket.findOneAndUpdate(
        { guildId: guild.id, ticketNumber },
        {
          $set: {
            status: 'closed',
            closedAt,
            closedById: user.id,
            closedByUsername: user.username || user.tag || user.id,
            lastMessageAt: closedAt,
            lastResponderId: user.id,
            lastResponderName: user.username || user.tag || user.id,
            lastResponderAt: closedAt
          }
        }
      ).catch(() => {});
    } else {
      // Fallback: locate by channelId
      await Ticket.findOneAndUpdate(
        { guildId: guild.id, channelId: channel.id },
        {
          $set: {
            status: 'closed',
            closedAt,
            closedById: user.id,
            closedByUsername: user.username || user.tag || user.id,
            lastMessageAt: closedAt,
            lastResponderId: user.id,
            lastResponderName: user.username || user.tag || user.id,
            lastResponderAt: closedAt
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

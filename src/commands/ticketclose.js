// src/commands/ticketclose.js

const { PermissionFlagsBits } = require('discord.js');
const Ticket = require('../database/models/Ticket');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');

module.exports = {
  name: 'ticketclose',
  description: 'Fecha o ticket atual.',

  async execute(message, args = [], client) {
    try {
      if (!message?.guild) return;

      const guild = message.guild;
      let channel = message.channel;

      // If the command is used inside a thread, resolve to its parent channel
      if (channel?.isThread?.()) {
        channel = channel.parent || channel;
      }

      // Allow staff to close a ticket by channel mention/ID: !ticketclose #channel
      const raw = (args[0] || '').trim();
      const chId = raw
        ? (raw.match(/^<#(\d+)>$/)?.[1] || raw.match(/^(\d{16,20})$/)?.[1] || null)
        : null;

      let staff = false;
      try {
        staff = await isStaff(message.member);
      } catch {
        staff = false;
      }

      if (chId) {
        if (!staff) {
          return message.reply(t('common.noPermission') || 'Sem permissão.').catch(() => null);
        }
        const target = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));
        if (!target) {
          return message.reply('❓ Não encontrei esse canal.').catch(() => null);
        }
        channel = target;
        if (channel?.isThread?.()) {
          channel = channel.parent || channel;
        }
      }

      const ticket = await Ticket.findOne({
        guildId: guild.id,
        channelId: channel.id,
        status: 'OPEN'
      });

      if (!ticket) {
        const hint = staff
          ? '❓ Este canal não está associado a um ticket aberto. (Dica: usa `!ticketclose #canal` no canal de staff)'
          : '❓ Este canal não está associado a um ticket aberto.';
        return message.reply(hint).catch(() => null);
      }

      const isOwner = ticket.userId === message.author.id;

      if (!isOwner && !staff) {
        return message.reply(t('common.noPermission') || 'Sem permissão para fechar este ticket.').catch(() => null);
      }

      if (ticket.status === 'CLOSED') {
        return message.reply('Este ticket já se encontra fechado.').catch(() => null);
      }

      ticket.status = 'CLOSED';
      ticket.closedById = message.author.id;
      ticket.closedAt = new Date();
      await ticket.save();

      // Tentar evitar mais mensagens do utilizador
      try {
        await channel.permissionOverwrites.edit(ticket.userId, {
          SendMessages: false
        });
      } catch (err) {
        console.warn('[ticketclose] Failed to update overwrites:', err?.message || err);
      }

      // Renomear canal (opcional)
      try {
        if (!channel.name.startsWith('closed-')) {
          await channel.setName(`closed-${channel.name.substring(0, 80)}`);
        }
      } catch (err) {
        console.warn('[ticketclose] Failed to rename channel:', err?.message || err);
      }

      await message
        .reply('✅ Ticket fechado. Obrigado por entrares em contacto!')
        .catch(() => null);
    } catch (err) {
      console.error('[ticketclose] Error:', err);
      await message
        .reply(t('common.unexpectedError') || 'Ocorreu um erro ao fechar o ticket.')
        .catch(() => null);
    }
  }
};

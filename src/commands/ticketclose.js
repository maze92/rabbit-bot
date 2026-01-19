// src/commands/ticketclose.js

const { PermissionFlagsBits } = require('discord.js');
const Ticket = require('../database/models/Ticket');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');

module.exports = {
  name: 'ticketclose',
  description: 'Fecha o ticket atual.',

  async execute(message) {
    try {
      if (!message?.guild) return;

      const guild = message.guild;
      const channel = message.channel;

      const ticket = await Ticket.findOne({
        guildId: guild.id,
        channelId: channel.id,
        status: 'OPEN'
      });

      if (!ticket) {
        return message
          .reply('❓ Este canal não está associado a um ticket aberto.')
          .catch(() => null);
      }

      const isOwner = ticket.userId === message.author.id;
      let staff = false;
      try {
        staff = await isStaff(message.member);
      } catch {
        staff = false;
      }

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

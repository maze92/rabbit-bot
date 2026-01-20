// src/commands/ticket.js

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config/defaultConfig');
const Ticket = require('../database/models/Ticket');
const { t } = require('../systems/i18n');

module.exports = {
  name: 'ticket',
  description: 'Cria um canal de suporte privado (ticket).',

  async execute(message, args, client) {
    try {
      if (!message?.guild) return;
      if (!config.tickets || config.tickets.enabled === false) {
        return message.reply('🛠 O sistema de tickets está desativado na configuração.').catch(() => null);
      }

      const guild = message.guild;

      // Verificar se o utilizador já tem um ticket aberto
      let existing = null;
      try {
        existing = await Ticket.findOne({
          guildId: guild.id,
          userId: message.author.id,
          status: 'OPEN'
        }).lean();
      } catch (err) {
        console.error('[ticket] Failed to query existing ticket:', err);
      }

      if (existing) {
        const ch = guild.channels.cache.get(existing.channelId);
        if (ch) {
          return message
            .reply(`❗ Já tens um ticket aberto em ${ch}. Usa esse canal ou pede a um staff para o fechar.`)
            .catch(() => null);
        }
      }

      const topic = args.join(' ').trim() || 'Sem tópico especificado';

      const ticketCfg = config.tickets || {};
      let parentId = ticketCfg.categoryId || null;
      if (parentId && !guild.channels.cache.get(parentId)) {
        parentId = null;
      }

      let staffRoleIds = Array.isArray(ticketCfg.staffRoleIds) && ticketCfg.staffRoleIds.length
        ? ticketCfg.staffRoleIds
        : Array.isArray(config.staffRoles)
          ? config.staffRoles
          : [];

      staffRoleIds = staffRoleIds.map((id) => String(id));

      const baseName = `ticket-${(message.author.username || message.author.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 20) || message.author.id}`;

      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: message.author.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages
          ]
        }
      ];

      for (const roleId of staffRoleIds) {
        overwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }

      const channel = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildText,
        parent: parentId || undefined,
        permissionOverwrites: overwrites
      });

      await Ticket.create({
        guildId: guild.id,
        channelId: channel.id,
        userId: message.author.id,
        createdById: message.author.id,
        topic
      });

      const staffPing = staffRoleIds.length
        ? staffRoleIds.map((id) => `<@&${id}>`).join(' ')
        : '';

      await message
        .reply(`✅ Ticket criado em ${channel}. Vamos falar por lá.`)
        .catch(() => null);

      const introLines = [
        `👋 Olá ${message.author}, obrigado pelo contacto!`,
        '',
        `📌 **Tópico:** ${topic}`,
        ' ',
        'Um membro da equipa irá responder assim que possível.'
      ];

      if (staffPing) {
        introLines.push('', staffPing);
      }

      await channel.send(introLines.join('\n')).catch(() => null);
    } catch (err) {
      console.error('[ticket] Error:', err);
      await message.reply(t('common.unexpectedError') || 'Ocorreu um erro ao criar o ticket.').catch(() => null);
    }
  }
};

// src/slash/ticket.js

const { ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');
const Ticket = require('../database/models/Ticket');
const { canUseTicketOrHelp } = require('./utils');

module.exports = async function ticketSlash(client, interaction) {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    if (!guild || !member) {
      return interaction.reply({
        content: t('common.guildOnly') || 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Permissões específicas para /ticket (cargo base + acima, ou staff)
    if (!canUseTicketOrHelp(member)) {
      return interaction.reply({
        content: t('common.noPermission') || 'Não tens permissão para criar tickets.',
        flags: MessageFlags.Ephemeral
      });
    }

    const ticketsCfg = config.tickets || {};
    if (ticketsCfg.enabled === false) {
      return interaction.reply({
        content: t('tickets.disabled') || 'O sistema de tickets está desativado.',
        flags: MessageFlags.Ephemeral
      });
    }

    const topicRaw = interaction.options.getString('topic');
    const topic = topicRaw && topicRaw.trim().length
      ? topicRaw.trim()
      : (t('tickets.noTopic') || 'Sem tópico especificado');

    // Nome do canal: ticket-nome
    const safeUsername = (interaction.user.username || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const baseName = safeUsername ? `ticket-${safeUsername}` : 'ticket';
    const channelName = baseName.slice(0, 80);

    // Permissões do canal
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      }
    ];

    // Roles de staff configuradas (para ver/gerir tickets)
    const staffRoleIds = Array.isArray(ticketsCfg.staffRoleIds) && ticketsCfg.staffRoleIds.length
      ? ticketsCfg.staffRoleIds
      : (Array.isArray(config.staffRoles) ? config.staffRoles : []);

    for (const roleId of staffRoleIds) {
      overwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }

    // Garantir que o bot tem acesso total ao canal de ticket
    const botMember = guild.members.me || guild.members.cache.get(client.user.id);
    if (botMember) {
      overwrites.push({
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }

    // Categoria (opcional) onde os tickets serão criados
    let parent = null;
    if (ticketsCfg.categoryId) {
      const cat = guild.channels.cache.get(ticketsCfg.categoryId);
      if (cat && cat.type === ChannelType.GuildCategory) {
        parent = cat;
      }
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parent || undefined,
      permissionOverwrites: overwrites
    });

    // Guardar o ticket em Mongo para aparecer na dashboard
    try {
      await Ticket.create({
        guildId: guild.id,
        channelId: channel.id,
        userId: interaction.user.id,
        createdById: interaction.user.id,
        status: 'OPEN',
        topic
      });
    } catch (err) {
      console.error('[slash/ticket] Failed to create Ticket document:', err?.message || err);
    }

    const introLines = [
      `👋 Olá ${interaction.user}, obrigado pelo contacto!`,
      '',
      `📌 **Tópico:** ${topic}`,
      '',
      'Um membro da equipa irá responder assim que possível.'
    ];

    if (staffRoleIds.length) {
      introLines.push('', staffRoleIds.map((id) => `<@&${id}>`).join(' '));
    }

    await channel.send({
      content: introLines.join('\n'),
      allowedMentions: { users: [interaction.user.id], roles: staffRoleIds }
    });

    return interaction.reply({
      content: t('tickets.created', { channel: String(channel) }) || `Ticket criado: ${channel}`,
      flags: MessageFlags.Ephemeral
    });
  } catch (err) {
    console.error('[slash/ticket] Error:', err);
    try {
      const payload = {
        content: t('common.unexpectedError') || 'Unexpected error creating ticket.',
        flags: MessageFlags.Ephemeral
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {
      // ignore
    }
  }
};

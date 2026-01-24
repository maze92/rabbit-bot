// src/slash/ticket.js

const { ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');
const Ticket = require('../database/models/Ticket');

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

    const ticketsCfg = config.tickets || {};
    if (ticketsCfg.enabled === false) {
      return interaction.reply({
        content: t('tickets.disabled') || 'Ticket system is disabled.',
        flags: MessageFlags.Ephemeral
      });
    }

    const topic = interaction.options.getString('topic') || 'Sem tópico especificado';

    // Resolve staff roles (from tickets config or global staffRoles)
    let staffRoleIds = Array.isArray(ticketsCfg.staffRoleIds) && ticketsCfg.staffRoleIds.length
      ? ticketsCfg.staffRoleIds
      : (Array.isArray(config.staffRoles) ? config.staffRoles : []);

    staffRoleIds = staffRoleIds.map((id) => String(id));

    const hasStaffRole = member.roles.cache.some((r) => staffRoleIds.includes(r.id));

    if (!hasStaffRole) {
      return interaction.reply({
        content: t('common.noPermission') || 'You do not have permission to create tickets.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Check if this user already has an open ticket in this guild
    try {
      const existing = await Ticket.findOne({
        guildId: guild.id,
        userId: interaction.user.id,
        status: 'OPEN'
      }).lean();

      if (existing) {
        const ch = guild.channels.cache.get(existing.channelId);
        if (ch) {
          return interaction.reply({
            content: `❗ Já tens um ticket aberto em ${ch}. Usa esse canal ou pede a um staff para o fechar.`,
            flags: MessageFlags.Ephemeral
          });
        }
      }
    } catch (err) {
      console.warn('[slash/ticket] Failed to query existing ticket:', err?.message || err);
    }

    // Discord channel name constraints are strict; keep it safe + short.
    const baseName = `ticket-${(interaction.user.username || interaction.user.id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || interaction.user.id}`;

    const channelName = baseName || 'ticket';

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

    // Allow configured staff roles
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

    // Ensure the bot can access/manage the channel
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

    let parent = null;
    if (ticketsCfg.categoryId) {
      parent = guild.channels.cache.get(ticketsCfg.categoryId) || null;
      if (!parent || parent.type !== ChannelType.GuildCategory) parent = null;
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parent || undefined,
      permissionOverwrites: overwrites
    });

    // Persist the ticket so it appears in the dashboard and can be closed later
    try {
      await Ticket.create({
        guildId: guild.id,
        channelId: channel.id,
        userId: interaction.user.id,
        createdById: interaction.user.id,
        topic
      });
    } catch (err) {
      console.error('[slash/ticket] Failed to create Ticket document:', err?.message || err);
    }

    const introLines = [
      `👋 Olá ${interaction.user}, obrigado pelo contacto!`,
      '',
      `📌 **Tópico:** ${topic}`,
      ' ',
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
      content: `Ticket criado: ${channel}`,
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

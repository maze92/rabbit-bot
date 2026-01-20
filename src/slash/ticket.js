// src/slash/ticket.js

const { ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');

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

    const topic = interaction.options.getString('topic') || null;

    // Resolve staff roles (from tickets config or global staffRoles)
    const staffRoleIds = Array.isArray(ticketsCfg.staffRoleIds) && ticketsCfg.staffRoleIds.length
      ? ticketsCfg.staffRoleIds
      : (Array.isArray(config.staffRoles) ? config.staffRoles : []);

    const hasStaffRole = member.roles.cache.some((r) => staffRoleIds.includes(r.id));

    if (!hasStaffRole) {
      return interaction.reply({
        content: t('common.noPermission') || 'You do not have permission to create tickets.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Discord channel name constraints are strict; keep it safe + short.
    const baseName = `ticket-${interaction.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9\-]/g, '');

    const channelName = (baseName.slice(0, 32) || 'ticket');

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

    const parts = [];
    parts.push(`Ticket criado por ${interaction.user} (slash).`);
    if (topic) parts.push(`Assunto: **${topic}**`);

    await channel.send({
      content: parts.join('\n') || 'Novo ticket criado.',
      allowedMentions: { users: [interaction.user.id], roles: staffRoleIds }
    });

    return interaction.reply({
      content: `Ticket criado: ${channel}`,
      flags: MessageFlags.Ephemeral
    });
  } catch (err) {
    console.error('[slash/ticket] Error:', err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: t('common.unexpectedError') || 'Unexpected error creating ticket.',
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: t('common.unexpectedError') || 'Unexpected error creating ticket.',
          flags: MessageFlags.Ephemeral
        });
      }
    } catch {
      // ignore
    }
  }
};

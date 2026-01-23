// src/slash/ticketclose.js

const Ticket = require('../database/models/Ticket');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');

module.exports = async (client, interaction) => {
  try {
    if (!interaction?.guild) return;

    const guild = interaction.guild;
    const member = interaction.member;

    let staff = false;
    try {
      staff = await isStaff(member);
    } catch {
      staff = false;
    }

    // Optional channel argument (staff can close tickets from a staff channel)
    const channelOpt = interaction.options?.getChannel?.('channel');
    let channel = channelOpt || interaction.channel;
    if (!channel) {
      return interaction.reply({ content: t('common.unexpectedError'), flags: 64 }).catch(() => null);
    }

    // If used inside a thread (or a thread is provided), resolve to the parent ticket channel
    if (channel?.isThread?.()) {
      channel = channel.parent || channel;
    }

    // If used inside a thread, resolve to its parent channel
    if (channel?.isThread?.()) {
      channel = channel.parent || channel;
    }

    const ticket = await Ticket.findOne({
      guildId: guild.id,
      channelId: channel.id,
      status: 'OPEN'
    });

    if (!ticket) {
      const msg = staff
        ? '❓ Este canal não está associado a um ticket aberto. (Podes usar /ticketclose channel:#canal)'
        : '❓ Este canal não está associado a um ticket aberto.';
      return interaction.reply({ content: msg, flags: 64 }).catch(() => null);
    }

    const isOwner = ticket.userId === interaction.user.id;
    if (!isOwner && !staff) {
      return interaction.reply({ content: t('common.noPermission'), flags: 64 }).catch(() => null);
    }

    ticket.status = 'CLOSED';
    ticket.closedById = interaction.user.id;
    ticket.closedAt = new Date();
    await ticket.save();

    // Prevent further messages from the ticket owner
    try {
      await channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false });
    } catch {
      // ignore
    }

    // Rename channel (optional)
    try {
      if (channel?.name && !channel.name.startsWith('closed-')) {
        await channel.setName(`closed-${channel.name.substring(0, 80)}`);
      }
    } catch {
      // ignore
    }

    // Public confirmation in the ticket channel; ephemeral confirmation to the actor
    try {
      await channel.send('✅ Ticket fechado. Obrigado por entrares em contacto!').catch(() => null);
    } catch {
      // ignore
    }

    return interaction.reply({ content: '✅ Ticket fechado.', flags: 64 }).catch(() => null);
  } catch (err) {
    console.error('[slash/ticketclose] Error:', err);
    try {
      const payload = { content: t('common.unexpectedError'), flags: 64 };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch {
      // ignore
    }
  }
};

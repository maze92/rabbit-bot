const Ticket = require('../database/models/Ticket');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');

module.exports = async (client, interaction) => {
  if (!interaction || !interaction.guild || !interaction.channel) return;

  const guild = interaction.guild;
  const member = interaction.member;
  const channel = interaction.channel;

  try {
    const ticket = await Ticket.findOne({ guildId: guild.id, channelId: channel.id });
    if (!ticket) {
      return interaction.reply({
        content: t('tickets.notFound', '❌ Não foi encontrado nenhum ticket associado a este canal.'),
      });
    }

    const isTicketOwner = ticket.userId === member.id || ticket.createdById === member.id;
    const staff = await isStaff(guild, member).catch(() => false);

    if (!staff && !isTicketOwner) {
      return interaction.reply({
        content: t('tickets.noPermissionClose', '❌ Apenas staff ou o autor do ticket podem fechá-lo.'),
      });
    }

    if (ticket.status === 'CLOSED') {
      return interaction.reply({
        content: '✅ Ticket fechado. Obrigado por entrares em contacto!',
      });
    }

    // Respond immediately
    await interaction.reply({
      content: '✅ Ticket fechado. Obrigado por entrares em contacto!',
    });

    // Update ticket state
    ticket.status = 'CLOSED';
    ticket.closedById = member.id;
    ticket.closedAt = new Date();
    await ticket.save().catch(() => null);

    // Update permissions
    try {
      const targetMember =
        guild.members.cache.get(ticket.userId) ||
        await guild.members.fetch(ticket.userId).catch(() => null);
      if (targetMember) {
        await channel.permissionOverwrites
          .edit(targetMember, { SendMessages: false })
          .catch(() => null);
      }
    } catch {}

    // Rename channel safely
    try {
      let baseName = channel.name || '';
      baseName = baseName.replace(/^closed-ticket-/i, '');
      baseName = baseName.replace(/^ticket-/i, '');
      baseName = baseName.replace(/^closed-/i, '');

      if (!baseName || !baseName.trim()) {
        baseName = ticket.username || ticket.userTag || ticket.userId || 'ticket';
      }

      const newName = `closed-ticket-${baseName}`.slice(0, 95);
      await channel.setName(newName).catch(() => null);
    } catch {}

  } catch (err) {
    console.error('[slash/ticketclose] Fatal error:', err);
    try {
      if (!interaction.replied) {
        await interaction.reply({ content: 'Ocorreu um erro inesperado.' });
      }
    } catch {}
  }
};

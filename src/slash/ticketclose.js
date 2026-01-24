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
        content: t('tickets.notFound', '❌ Não foi encontrado nenhum ticket associado a este canal.')
      });
    }

    const isTicketOwner = ticket.userId === member.id || ticket.createdById === member.id;
    const staff = await isStaff(guild, member).catch(() => false);

    if (!staff && !isTicketOwner) {
      return interaction.reply({
        content: t('tickets.noPermissionClose', '❌ Apenas staff ou o autor do ticket podem fechá-lo.')
      });
    }

    // Se já estiver fechado, respondemos mas não tentamos renomear outra vez
    if (ticket.status === 'CLOSED') {
      return interaction.reply({
        content: '✅ Ticket fechado. Obrigado por entrares em contacto!'
      });
    }

    // Responder logo ao comando para não dar "O aplicativo não respondeu"
    await interaction.reply({
      content: '✅ Ticket fechado. Obrigado por entrares em contacto!'
    });

    // Atualizar estado na BD
    ticket.status = 'CLOSED';
    ticket.closedById = member.id;
    ticket.closedAt = new Date();
    await ticket.save().catch(() => null);

    // Melhor esforço: remover permissão de falar ao autor do ticket
    try {
      const userIdStr = String(ticket.userId || '').trim();
      if (/^[0-9]{10,20}$/.test(userIdStr)) {
        await channel.permissionOverwrites
          .edit(userIdStr, { SendMessages: false })
          .catch(() => null);
      }
    } catch (err) {
      console.warn('[slash/ticketclose] Failed to update overwrites on close:', err?.message || err);
    }

    // Renomear canal para o formato canónico closed-ticket-<algo>
    try {
      const current = channel.name || '';
      let baseName = current
        .replace(/^closed-ticket-/i, '')
        .replace(/^ticket-/i, '')
        .replace(/^closed-/i, '')
        .trim();

      if (!baseName) {
        baseName =
          ticket.username ||
          ticket.userTag ||
          ticket.userId ||
          'ticket';
      }

      baseName = String(baseName).replace(/\s+/g, '-');
      const newName = `closed-ticket-${baseName}`.slice(0, 95);
      await channel.setName(newName).catch(() => null);
    } catch (err) {
      console.warn('[slash/ticketclose] Failed to rename channel on close:', err?.message || err);
    }
  } catch (err) {
    console.error('[slash/ticketclose] Fatal error:', err);
    try {
      if (!interaction.replied) {
        await interaction.reply({ content: 'Ocorreu um erro inesperado.' });
      }
    } catch {}
  }
};

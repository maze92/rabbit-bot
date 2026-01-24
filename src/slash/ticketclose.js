const Ticket = require('../database/models/Ticket');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');

module.exports = async (client, interaction) => {
  try {
    if (!interaction || !interaction.guild || !interaction.channel) return;

    const guild = interaction.guild;
    const member = interaction.member;
    const channel = interaction.channel;

    const ticket = await Ticket.findOne({ guildId: guild.id, channelId: channel.id }).lean();
    if (!ticket) {
      return interaction.reply({
        content: t('tickets.notFound', '❌ Não foi encontrado nenhum ticket associado a este canal.'),
      }).catch(() => null);
    }

    const isTicketOwner = ticket.userId === member.id || ticket.createdById === member.id;
    const staff = await isStaff(guild, member).catch(() => false);

    if (!staff && !isTicketOwner) {
      return interaction.reply({
        content: t('tickets.noPermissionClose', '❌ Apenas staff ou o autor do ticket podem fechá-lo.'),
      }).catch(() => null);
    }

    if (ticket.status === 'CLOSED') {
      return interaction.reply({
        content: t('tickets.alreadyClosed', '✅ Ticket fechado. Obrigado por entrares em contacto!'),
      }).catch(() => null);
    }

    // ✅ Resposta imediata ao comando (uma única mensagem)
    await interaction.reply({
      content: '✅ Ticket fechado. Obrigado por entrares em contacto!',
    }).catch(() => null);

    // Resto da lógica em best-effort (não afeta a resposta do slash)
    try {
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $set: {
            status: 'CLOSED',
            closedById: member.id,
            closedAt: new Date()
          }
        }
      ).catch(() => null);

      try {
        const userId = ticket.userId;
        if (userId) {
          const targetMember =
            guild.members.cache.get(userId) ||
            await guild.members.fetch(userId).catch(() => null);
          if (targetMember) {
            await channel.permissionOverwrites
              .edit(targetMember, { SendMessages: false })
              .catch(() => null);
          }
        }
      } catch (err) {
        console.warn('[slash/ticketclose] Failed to update overwrites:', err?.message || err);
      }

      try {
  const currentName = channel.name || '';
  let baseName = currentName;

  // Remove prefixes from previous states: closed-ticket-, ticket-, closed-
  baseName = baseName.replace(/^closed-ticket-/i, '');
  baseName = baseName.replace(/^ticket-/i, '');
  baseName = baseName.replace(/^closed-/i, '');

  if (!baseName || !baseName.trim()) {
    baseName = ticket.username || ticket.userTag || ticket.userId || 'ticket';
  }

  const newName = `closed-ticket-${baseName}`.slice(0, 95);
  await channel.setName(newName).catch(() => null);
} catch (err) {
  console.warn('[slash/ticketclose] Failed to rename ticket channel:', err?.message || err);
}

        console.warn('[slash/ticketclose] Failed to rename ticket channel:', err?.message || err);
      }
    } catch (err) {
      console.error('[slash/ticketclose] Error after reply:', err);
    }
  } catch (err) {
    console.error('[slash/ticketclose] Error:', err);
    try {
      const msg = t('common.unexpectedError', 'Ocorreu um erro inesperado.');
      if (interaction && (interaction.replied || interaction.deferred)) {
        await interaction.followUp({ content: msg });
      } else if (interaction) {
        await interaction.reply({ content: msg });
      }
    } catch {
    }
  }
};

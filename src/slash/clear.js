// src/slash/clear.js

const { PermissionsBitField } = require('discord.js');

const logger = require('../systems/logger');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');

// Helper para respostas ephemerais (64 = Ephemeral)
function replyEphemeral(interaction, content) {
  return interaction
    .reply({ content, flags: 64 })
    .catch(() => null);
}

module.exports = async function clearSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;

    const guild = interaction.guild;
    const executor = interaction.member;
    const botMember = guild.members.me;
    if (!executor || !botMember) {
      return replyEphemeral(interaction, t('common.unexpectedError'));
    }

    if (!(await isStaff(executor)) {
      return replyEphemeral(interaction, t('common.noPermission'));
    }

    const perms = interaction.channel?.permissionsFor?.(botMember);
    if (!perms?.has(PermissionsBitField.Flags.ManageMessages)) {
      return replyEphemeral(interaction, t('clear.noPerm'));
    }

    const amount = interaction.options.getInteger('amount', true);
    const toDelete = Math.min(100, amount);

    let deleted = null;
    try {
      deleted = await interaction.channel.bulkDelete(toDelete, true);
    } catch (err) {
      console.error('[slash/clear] bulkDelete error:', err);
      deleted = null;
    }

    if (!deleted) {
      return replyEphemeral(interaction, t('clear.tooOldOrNoPerm'));
    }

    const deletedCount = deleted.size || 0;

    await interaction
      .reply({
        content: t('clear.success', null, { count: deletedCount }),
        flags: 64 // resposta ephemeral com flags
      })
      .catch(() => null);

    await logger(
      client,
      'Slash Clear Messages',
      null,
      interaction.user,
      t('log.actions.clear', null, {
        count: deletedCount,
        channelId: interaction.channel.id
      }),
      guild
    );
  } catch (err) {
    console.error('[slash/clear] Error:', err);

    const payload = { content: t('common.unexpectedError'), flags: 64 };

    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload).catch(() => null);
    }
    return interaction.reply(payload).catch(() => null);
  }
};

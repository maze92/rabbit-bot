// src/slash/clear.js

const { PermissionsBitField } = require('discord.js');

const logger = require('../systems/logger');
const { t } = require('../systems/i18n');
const { isStaff } = require('./utils');

module.exports = async function clearSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;

    const guild = interaction.guild;
    const executor = interaction.member;
    const botMember = guild.members.me;
    if (!executor || !botMember) {
      return interaction.reply({ content: t('common.unexpectedError'), ephemeral: true }).catch(() => null);
    }

    if (!isStaff(executor)) {
      return interaction.reply({ content: t('common.noPermission'), ephemeral: true }).catch(() => null);
    }

    const perms = interaction.channel?.permissionsFor?.(botMember);
    if (!perms?.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({ content: t('clear.noPerm'), ephemeral: true }).catch(() => null);
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
      return interaction.reply({ content: t('clear.tooOldOrNoPerm'), ephemeral: true }).catch(() => null);
    }

    const deletedCount = deleted.size || 0;

    await interaction.reply({ content: t('clear.success', null, { count: deletedCount }), ephemeral: true }).catch(() => null);

    await logger(
      client,
      'Slash Clear Messages',
      null,
      interaction.user,
      t('log.actions.clear', null, { count: deletedCount, channelId: interaction.channel.id }),
      guild
    );
  } catch (err) {
    console.error('[slash/clear] Error:', err);
    const payload = { content: t('common.unexpectedError'), ephemeral: true };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
    return interaction.reply(payload).catch(() => null);
  }
};

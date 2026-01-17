// src/slash/clear.js

const { PermissionsBitField } = require('discord.js');
const logger = require('../systems/logger');
const { t } = require('../systems/i18n');

module.exports = async (client, interaction) => {
  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  const guild = interaction.guild;
  const botMember = guild?.members?.me;
  if (!guild || !botMember) return;

  const perms = interaction.channel?.permissionsFor?.(botMember);
  if (!perms?.has(PermissionsBitField.Flags.ManageMessages)) {
    return interaction.editReply({ content: t('clear.noPerm') }).catch(() => null);
  }

  const amount = interaction.options.getInteger('amount', true);

  let deleted = null;
  try {
    deleted = await interaction.channel.bulkDelete(amount, true);
  } catch (err) {
    console.error('[slash/clear] bulkDelete error:', err);
    deleted = null;
  }

  if (!deleted) {
    return interaction.editReply({ content: t('clear.tooOldOrNoPerm') }).catch(() => null);
  }

  await logger(
    client,
    'Slash Clear',
    null,
    interaction.user,
    `Channel: <#${interaction.channel.id}>\nDeleted: **${deleted.size}** messages`,
    guild
  );

  return interaction
    .editReply({ content: t('clear.success', null, { count: deleted.size }) })
    .catch(() => null);
};

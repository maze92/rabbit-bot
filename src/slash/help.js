// src/slash/help.js

const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');
const { replyEphemeral } = require('../utils/discord');
const { safeReply } = require('../utils/discord');

module.exports = async function helpSlash(_client, interaction) {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    if (!guild || !member) {
      return replyEphemeral(
        interaction,
        t('common.guildOnly')
      );
    }

    const { canUseTicketOrHelp } = require('./utils');
    if (!canUseTicketOrHelp(member)) {
      return replyEphemeral(
        interaction,
        t('common.noPermission')
      );
    }

    const prefix = config.prefix || '!';
    const lines = [];

    lines.push(`**${t('help.title')}**`);
    lines.push('');

    lines.push(`__${t('help.moderationTitle')}__`);
    lines.push(...t('help.moderation', null, prefix));
    lines.push('');

    lines.push(`__${t('help.automodTitle')}__`);
    lines.push(...t('help.automod'));
    lines.push('');

    lines.push(`__${t('help.gameNewsTitle')}__`);
    lines.push(...t('help.gameNews'));
    lines.push('');

    lines.push(`__${t('help.dashboardTitle')}__`);
    lines.push(...t('help.dashboard'));
    lines.push('');

    lines.push(t('help.footer', null, prefix));

    await replyEphemeral(interaction, lines.join('\n'));
  } catch (err) {
    console.error('[slash/help] Error:', err);
    return safeReply(interaction, { content: t('common.unexpectedError') }, { ephemeral: true });
  }
};

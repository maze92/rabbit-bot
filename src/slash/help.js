// src/slash/help.js

const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');

module.exports = async function helpSlash(_client, interaction) {
  try {
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

    await interaction
      .reply({
        content: lines.join('\n'),
        flags: 64 // Ephemeral
      })
      .catch(() => null);
  } catch (err) {
    console.error('[slash/help] Error:', err);

    const payload = {
      content: t('common.unexpectedError'),
      flags: 64
    };

    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload).catch(() => null);
    }
    return interaction.reply(payload).catch(() => null);
  }
};

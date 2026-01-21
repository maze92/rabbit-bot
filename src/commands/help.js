// src/commands/help.js

const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');

module.exports = {
  name: 'help',
  description: 'Show a summary of available commands and moderation features',

  async execute(message) {
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

    await message.channel.send(lines.join('\n')).catch(() => null);
  }
};
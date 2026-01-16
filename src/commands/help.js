// src/commands/help.js

const config = require('../config/defaultConfig');

module.exports = {
  name: 'help',
  description: 'Show a summary of available commands and moderation features',

  async execute(message) {
    const prefix = config.prefix || '!';
    const lines = [];

    lines.push('**Ozark Bot – Help**');
    lines.push('');
    lines.push('__Moderation Commands__');
    lines.push(`• \`${prefix}warn @user [reason]\` – issue a warning to a user`);
    lines.push(`• \`${prefix}mute @user [10m/1h/2d] [reason]\` – timeout (mute) a user`);
    lines.push(`• \`${prefix}unmute @user\` – remove timeout from a user`);
    lines.push(`• \`${prefix}clear <amount>\` – clear messages in the current channel (if implemented)`);
    lines.push(`• \`${prefix}userinfo [@user]\` – show info about a user (warnings, trust, infractions count)`);
    lines.push('');
    lines.push('__AutoMod & Anti-Spam__');
    lines.push('• AutoMod: detects banned words, deletes the message, adds a WARN and can auto-mute on repeated infractions.');
    lines.push('• Anti-Spam: detects repeated/similar messages in a short interval and applies an automatic mute.');
    lines.push('• Trust Score: repeat offenders lose trust and são moderados com menos tolerância (menos avisos / mute mais longo).');
    lines.push('');
    lines.push('__Game News__');
    lines.push('• GameNews: fetches RSS feeds (GameSpot) and sends new articles to specific channels.');
    lines.push('• Feeds têm backoff automático e status visível no dashboard.');
    lines.push('');
    lines.push('__Dashboard__');
    lines.push('• Log de moderação em tempo real + histórico (Mongo).');
    lines.push('• Painel de estado do GameNews + endpoint `/health` para monitorização.');
    lines.push('');
    lines.push(`If you need more details about a command, use it like \`${prefix}command\` followed by the arguments shown above.`);

    await message.channel.send(lines.join('\n')).catch(() => null);
  }
};

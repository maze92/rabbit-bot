// src/commands/help.js
const config = require('../config/defaultConfig');

module.exports = {
  name: 'help',
  permissions: [],

  async execute(message, args, client) {
    const commands = Array.from(client.commands.keys())
      .map(cmd => `\`${config.prefix}${cmd}\``)
      .join(', ');

    message.channel.send(`📜 **Available Commands:**\n${commands}`);
  }
};

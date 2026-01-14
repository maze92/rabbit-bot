const autoModeration = require('../systems/autoModeration');

module.exports = client => {
  client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    const prefix = '!';

    // Commands
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      const command = client.commands.get(commandName);
      if (!command) return;

      try {
        await command.execute(message, args, client);
      } catch (err) {
        console.error(`[Command Error] ${commandName}:`, err);
      }
      return;
    }

    // Auto moderation
    await autoModeration(message, client);
  });
};

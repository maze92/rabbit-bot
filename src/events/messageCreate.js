const autoModeration = require('../systems/autoModeration');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    await autoModeration(message);
  });
};

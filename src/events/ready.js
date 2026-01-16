// src/events/ready.js

let started = false;

module.exports = (client) => {
  client.once('clientReady', async () => {
    if (started) return;
    started = true;

    console.log(`✅ ${client.user.tag} is online!`);

    try {
      await client.user.setPresence({
        activities: [{ name: 'moderating the server', type: 3 }], // WATCHING
        status: 'online'
      });
    } catch (err) {
      console.error('[ready] presence error:', err);
    }
  });
};

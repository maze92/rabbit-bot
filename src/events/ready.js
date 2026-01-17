// src/events/ready.js

let started = false;

module.exports = (client) => {
  const setPresenceSafe = async () => {
    if (!client.user) return;

    try {
      await client.user.setPresence({
        activities: [{ name: 'moderating the server', type: 3 }],
        status: 'online'
      });
    } catch (err) {
      console.error('[ready] presence error:', err);
    }
  };

  // Quando o Discord disser que o bot está pronto,
  // disparamos o teu evento interno "clientReady"
  client.once('ready', () => {
    try {
      client.emit('clientReady');
    } catch (err) {
      console.error('[ready] Failed to emit clientReady:', err);
    }
  });

  client.once('clientReady', async () => {
    if (started) return;
    started = true;

    console.log(`✅ ${client.user.tag} is online!`);
    await setPresenceSafe();
  });

  client.on('shardResume', async () => {
    await setPresenceSafe();
  });
};

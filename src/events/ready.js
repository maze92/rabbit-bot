// src/events/ready.js

let started = false;

const config = require('../config/defaultConfig');
const { startMaintenance } = require('../systems/maintenance');

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

  client.once('clientReady', async () => {
    if (started) return;
    started = true;

    console.log(`✅ ${client.user.tag} is online!`);

    // Inicia tarefas de manutenção periódicas (limpeza de infrações/logs antigos)
    startMaintenance(config);

    await setPresenceSafe();
  });

  client.on('shardResume', async () => {
    await setPresenceSafe();
  });
};

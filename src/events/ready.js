/**
 * Evento ready (clientReady)
 * Executado UMA vez quando o bot está totalmente online
 */

let started = false;

module.exports = client => {
  client.once('clientReady', async () => {

    // Evita execução duplicada (segurança extra)
    if (started) return;
    started = true;

    // ------------------------------
    // Bot online
    // ------------------------------
    console.log(`✅ ${client.user.tag} is online!`);

    // ------------------------------
    // Status / Presence do bot
    // ------------------------------
    try {
      await client.user.setPresence({
        activities: [
          {
            name: 'moderating the server',
            type: 3 // WATCHING
          }
        ],
        status: 'online'
      });
    } catch (err) {
      console.error('[ready] Error setting presence:', err);
    }

    // NOTA IMPORTANTE:
    // ❌ NÃO iniciar GameNews aqui
    // ✅ GameNews é iniciado no index.js
  });
};


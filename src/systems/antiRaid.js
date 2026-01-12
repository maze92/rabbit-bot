const User = require('../database/models/User');
const logger = require('./logger');

const joinMap = new Map();

module.exports = async (member, client) => {
  const now = Date.now();
  const guildId = member.guild.id;

  const joins = joinMap.get(guildId) || [];
  joins.push(now);
  joinMap.set(guildId, joins.filter(t => now - t < 60000)); // últimos 60s

  if (joins.length >= 5) {
    const user = await User.findOne({
      userId: member.id,
      guildId
    });

    if (user && user.trust < 40) {
      try {
        await member.timeout(60 * 60 * 1000, 'Anti-Raid');

        // Log usando logger.js
        await logger(
          client,
          'Anti-Raid',
          member.user,       // usuário afetado
          member.user,       // ninguém “modera” neste caso, usamos o próprio usuário
          `Timed out due to low trust (${user.trust})`
        );
      } catch (err) {
        console.error('Anti-Raid error:', err);
      }
    }
  }
};

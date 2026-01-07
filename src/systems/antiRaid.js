const User = require('../database/models/User');
const logger = require('./logger');

const joinMap = new Map();

module.exports = async (member) => {
  const now = Date.now();
  const guildId = member.guild.id;

  const joins = joinMap.get(guildId) || [];
  joins.push(now);
  joinMap.set(guildId, joins.filter(t => now - t < 60000));

  if (joins.length >= 5) {
    const user = await User.findOne({
      userId: member.id,
      guildId
    });

    if (user && user.trust < 40) {
      await member.timeout(60 * 60 * 1000, 'Anti-raid');
      logger(member.guild, 'Anti-Raid',
        `${member.user.tag} timed out (low trust)`);
    }
  }
};

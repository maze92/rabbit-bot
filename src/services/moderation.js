// src/services/moderation.js

const Infraction = require('../database/models/Infraction');
const { sanitizeText } = require('../systems/sanitize');

async function warnUser({ guildId, userId, moderatorId, reason }) {
  const cleanReason = sanitizeText(reason, { maxLen: 1000 });

  const inf = await Infraction.create({
    guildId,
    userId,
    moderatorId,
    type: 'WARN',
    reason: cleanReason,
  });

  return inf;
}

module.exports = {
  warnUser,
};

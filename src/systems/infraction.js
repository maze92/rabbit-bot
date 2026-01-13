const Infraction = require('../database/models/Infraction');
const logger = require('./logger');

module.exports = {
  async create({
    client,
    guild,
    user,
    moderator,
    type,
    reason,
    duration = null
  }) {
    if (!guild || !user || !moderator || !type) return;

    // Guardar no MongoDB
    const infraction = await Infraction.create({
      guildId: guild.id,
      userId: user.id,
      moderatorId: moderator.id,
      type,
      reason,
      duration
    });

    // Log automático
    await logger(
      client,
      `Infraction: ${type}`,
      user,
      moderator,
      `Reason: ${reason}${duration ? `\nDuration: ${duration / 60000} min` : ''}`,
      guild
    );

    return infraction;
  }
};

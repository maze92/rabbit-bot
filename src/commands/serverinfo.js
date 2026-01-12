// src/commands/serverinfo.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'serverinfo',
  permissions: [],

  async execute(message) {
    const guild = message.guild;

    const embed = new EmbedBuilder()
      .setTitle(`${guild.name} Info`)
      .addFields(
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true }
      )
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setTimestamp()
      .setColor('Blue');

    message.channel.send({ embeds: [embed] });
  }
};

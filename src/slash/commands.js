// src/slash/commands.js

const { SlashCommandBuilder } = require('discord.js');

module.exports = function buildSlashCommands(prefix) {
  const p = prefix || '!';

  return [
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Issue a warning to a user')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to warn').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason').setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Timeout (mute) a user')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to mute').setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('Duration like 10m, 1h, 2d (default from config)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason').setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Remove timeout (unmute) from a user')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to unmute').setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Clear messages in the current channel')
      .addIntegerOption((opt) =>
        opt
          .setName('amount')
          .setDescription('Amount to clear (1-100)')
          .setMinValue(1)
          .setMaxValue(100)
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Show info about a user (staff sees trust/infractions)')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Target user').setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('help')
      .setDescription(`Show help (prefix commands: ${p}...)`)
  ].map((c) => c.toJSON());
};

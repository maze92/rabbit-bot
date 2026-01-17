// src/slash/commands.js

const { SlashCommandBuilder } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to warn').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason').setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout (mute) a user')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to mute').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('duration')
        .setDescription('Duration like 10m, 2h, 1d (default uses config)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason').setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show user info (staff sees more details)')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User (optional)').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('limit')
        .setDescription('Staff: how many recent infractions to show (1-20)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear messages in a channel')
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Number of messages to delete (1–100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove timeout from a user')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to unmute').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason').setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands')
    .toJSON()
];

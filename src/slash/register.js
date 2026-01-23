// src/slash/register.js

const { REST, Routes } = require('discord.js');
const config = require('../config/defaultConfig');
const buildSlashCommands = require('./commands');

module.exports = async function registerSlashCommands(client) {
  try {
    const slashCfg = config.slash || {};
    if (slashCfg.enabled === false) return;

    const token = process.env.TOKEN;
    const clientId = slashCfg.clientId || process.env.CLIENT_ID || client?.user?.id;
    if (!token || !clientId) {
      console.warn('[slash/register] Missing TOKEN or CLIENT_ID (or unable to infer). Skipping slash registration.');
      return;
    }

    const rest = new REST({ version: '10' }).setToken(token);
    const commands = buildSlashCommands(config.prefix || '!');

    const guildId = slashCfg.guildId || process.env.GUILD_ID;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`[slash/register] Registered ${commands.length} guild slash commands in guild ${guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`[slash/register] Registered ${commands.length} global slash commands.`);
    }
  } catch (err) {
    console.error('[slash/register] Error:', err);
  }
};

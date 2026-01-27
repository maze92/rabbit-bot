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

    // 1) Clear ALL global commands to avoid duplicates
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log('[slash/register] Cleared existing global slash commands.');
    } catch (clearErr) {
      console.warn('[slash/register] Failed to clear global commands (can be ignored if none exist):', clearErr);
    }

    if (guildId) {
      // 2) Clear guild commands for this guild, then register fresh
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        console.log('[slash/register] Cleared existing guild slash commands for guild', guildId);
      } catch (gErr) {
        console.warn('[slash/register] Failed to clear guild commands (can be ignored on first run):', gErr);
      }

      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`[slash/register] Registered ${commands.length} guild slash commands in guild ${guildId}.`);
    } else {
      // 3) If no guildId is configured, fall back to global registration only
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`[slash/register] Registered ${commands.length} global slash commands.`);
    }
  } catch (err) {
    console.error('[slash/register] Error:', err);
  }
};

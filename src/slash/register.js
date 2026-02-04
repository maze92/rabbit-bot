// src/slash/register.js

const { REST, Routes } = require('discord.js');
const config = require('../config/defaultConfig');
const buildSlashCommands = require('./commands');

module.exports = async function registerSlashCommands(client) {
  try {
    const slashCfg = config.slash || {};
    if (slashCfg.enabled === false) return;
    if (slashCfg.registerOnStartup === false) {
      console.log('[slash/register] registerOnStartup=false; skipping slash registration.');
      return;
    }

    const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
    const clientId = slashCfg.clientId || process.env.CLIENT_ID || client?.user?.id;
    if (!token || !clientId) {
      console.warn('[slash/register] Missing TOKEN or CLIENT_ID (or unable to infer). Skipping slash registration.');
      return;
    }

    const rest = new REST({ version: '10' }).setToken(token);
    const commands = buildSlashCommands(config.prefix || '!');

    if (!Array.isArray(commands) || commands.length === 0) {
      console.warn('[slash/register] No slash commands to register.');
      return;
    }

    const guildId = slashCfg.guildId || process.env.SLASH_GUILD_ID || process.env.GUILD_ID;

    // 1) Registar sempre comandos globais
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`[slash/register] Registered ${commands.length} global slash commands.`);
    } catch (globalErr) {
      console.error('[slash/register] Failed to register global slash commands:', globalErr);
    }

    // 2) Se houver guildId configurado, registar também para essa guild (efeito imediato)
    if (guildId) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`[slash/register] Registered ${commands.length} guild slash commands in guild ${guildId}.`);
      } catch (guildErr) {
        console.error('[slash/register] Failed to register guild slash commands:', guildErr);
      }
    }
  } catch (err) {
    console.error('[slash/register] Error:', err);
  }
};

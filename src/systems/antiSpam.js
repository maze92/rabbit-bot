// src/systems/antiSpam.js
// ============================================================
// Anti-Spam / Flood protection
// - Deteta flood (muitas msgs num intervalo curto)
// - Aplica timeout automaticamente (mute)
// - Regista infração no MongoDB (infractionsService)
// - Log no Discord + Dashboard (logger)
// ============================================================

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const infractionsService = require('./infractionsService');
const logger = require('./logger');

// key: `${guildId}:${userId}` -> { timestamps: [], lastActionAt: number }
const messageMap = new Map();

// cleanup periódico para evitar crescer memória
const CLEANUP_EVERY_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of messageMap.entries()) {
    const lastTs = data?.timestamps?.[data.timestamps.length - 1];
    if (!lastTs || now - lastTs > 5 * 60_000) messageMap.delete(key);
  }
}, CLEANUP_EVERY_MS).unref?.();

module.exports = async function antiSpam(message, client) {
  try {
    if (!config.antiSpam?.enabled) return;
    if (!message?.guild) return;
    if (!message?.author || message.author.bot) return;
    if (!message?.member) return;

    const guild = message.guild;
    const botMember = guild.members.me;
    if (!botMember) return;

    // config safe
    const intervalMs = Number(config.antiSpam.interval ?? 7000);
    const maxMessages = Number(config.antiSpam.maxMessages ?? 6);
    const muteDurationMs = Number(config.antiSpam.muteDuration ?? 60_000);
    const actionCooldownMs = Number(config.antiSpam.actionCooldown ?? 60_000);

    const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 500 ? intervalMs : 7000;
    const safeMax = Number.isFinite(maxMessages) && maxMessages >= 3 ? maxMessages : 6;
    const safeMute = Number.isFinite(muteDurationMs) && muteDurationMs >= 5_000 ? muteDurationMs : 60_000;
    const safeActionCooldown = Number.isFinite(actionCooldownMs) && actionCooldownMs >= 5_000 ? actionCooldownMs : 60_000;

    const now = Date.now();
    const key = `${guild.id}:${message.author.id}`;

    // bypass admins (config)
    const bypassAdmins = config.antiSpam.bypassAdmins ?? true;
    if (bypassAdmins && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    // bypass roles (config)
    if (Array.isArray(config.antiSpam.bypassRoles) && config.antiSpam.bypassRoles.length > 0) {
      const hasBypassRole = message.member.roles.cache.some(r => config.antiSpam.bypassRoles.includes(r.id));
      if (hasBypassRole) return;
    }

    // hierarquia: user >= bot -> não dá para moderar
    if (message.member.roles.highest.position >= botMember.roles.highest.position) return;

    // permissão bot: timeout
    const perms = message.channel.permissionsFor(botMember);
    if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) return;

    // anti-loop
    const prev = messageMap.get(key);
    if (prev?.lastActionAt && now - prev.lastActionAt < safeActionCooldown) return;

    // atualizar timestamps dentro da janela
    const data = prev || { timestamps: [], lastActionAt: 0 };
    data.timestamps = data.timestamps.filter(ts => now - ts < safeInterval);
    data.timestamps.push(now);
    messageMap.set(key, data);

    if (data.timestamps.length < safeMax) return;

    // atingiu limite -> aplicar ação
    data.lastActionAt = now;
    data.timestamps = [];
    messageMap.set(key, data);

    if (!message.member.moderatable) return;

    await message.member.timeout(safeMute, 'Spam detected (AntiSpam)');

    if (config.antiSpam.sendMessage !== false) {
      await message.channel.send(`🔇 ${message.author} has been muted for spam.`).catch(() => null);
    }

    await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'MUTE',
      reason: 'Spam / Flood detected',
      duration: safeMute
    }).catch(() => null);

    await logger(
      client,
      'Anti-Spam Mute',
      message.author,
      client.user,
      `User muted for spam.\nDuration: **${Math.round(safeMute / 1000)}s**\nThreshold: **${safeMax} msgs / ${safeInterval}ms**`,
      guild
    );

  } catch (err) {
    console.error('[antiSpam] Error:', err);
  }
};

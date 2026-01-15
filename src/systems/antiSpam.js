// src/systems/antiSpam.js
// ============================================================
// Anti-Spam / Flood protection
//
// O que faz:
// - Deteta flood (muitas mensagens num intervalo curto)
// - Aplica timeout automaticamente (mute)
// - Regista infração no MongoDB (via infractionsService)
// - Regista log no Discord (log-bot) + Dashboard (via logger)
//
// Notas:
// - Tem proteção para não “mutar em loop” o mesmo utilizador
// - Tem limpeza automática para evitar crescimento infinito de memória
// ============================================================

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');
const infractionsService = require('./infractionsService'); // service (não confundir com model)
const logger = require('./logger');

// ------------------------------------------------------------
// Estrutura em memória para tracking de mensagens
// key: `${guildId}:${userId}`
// value: { timestamps: number[], lastActionAt: number }
// ------------------------------------------------------------
const messageMap = new Map();

// Limpeza periódica (evita “memory leak”)
// Remove entradas antigas que já não interessam
const CLEANUP_EVERY_MS = 60_000; // 1 min
setInterval(() => {
  const now = Date.now();

  for (const [key, data] of messageMap.entries()) {
    // Se não houver timestamps ou estiver tudo muito antigo, apaga
    if (!data?.timestamps?.length) {
      messageMap.delete(key);
      continue;
    }

    // Se a última mensagem foi há muito tempo, remove
    const lastTs = data.timestamps[data.timestamps.length - 1];
    if (now - lastTs > 5 * 60_000) { // 5 min sem atividade
      messageMap.delete(key);
    }
  }
}, CLEANUP_EVERY_MS).unref?.();

/**
 * AntiSpam handler
 * @param {Message} message
 * @param {Client} client
 */
module.exports = async function antiSpam(message, client) {
  try {
    // ------------------------------
    // 1) Validações básicas
    // ------------------------------
    if (!config.antiSpam?.enabled) return;
    if (!message?.guild) return; // ignora DMs
    if (!message?.author || message.author.bot) return;
    if (!message?.member) return; // precisamos do member para moderação/hierarquia

    const guild = message.guild;
    const botMember = guild.members.me;
    if (!botMember) return;

    // ------------------------------
    // 2) Config do AntiSpam (defaults seguros)
    // ------------------------------
    const intervalMs = Number(config.antiSpam.interval ?? 7000);          // janela (ms)
    const maxMessages = Number(config.antiSpam.maxMessages ?? 6);         // msgs na janela
    const muteDurationMs = Number(config.antiSpam.muteDuration ?? 60_000); // timeout (ms)

    // Cooldown após punir (para não punir em loop)
    const actionCooldownMs = Number(config.antiSpam.actionCooldown ?? 60_000); // 60s

    // Se config vier inválida, corrige para valores seguros
    const safeInterval = Number.isFinite(intervalMs) && intervalMs > 500 ? intervalMs : 7000;
    const safeMax = Number.isFinite(maxMessages) && maxMessages >= 3 ? maxMessages : 6;
    const safeMute = Number.isFinite(muteDurationMs) && muteDurationMs >= 5_000 ? muteDurationMs : 60_000;
    const safeActionCooldown = Number.isFinite(actionCooldownMs) && actionCooldownMs >= 5_000
      ? actionCooldownMs
      : 60_000;

    const now = Date.now();
    const key = `${guild.id}:${message.author.id}`;

    // ------------------------------
    // 3) Bypass (opcional)
    // ------------------------------
    // 3.1 Admin bypass
    // Se quiseres que admins também possam ser mutados por spam,
    // mete antiSpam.bypassAdmins = false no config.
    const bypassAdmins = config.antiSpam.bypassAdmins ?? true;
    if (bypassAdmins && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    // 3.2 Bypass por cargos (opcional)
    // Ex: antiSpam.bypassRoles: ['roleId1', 'roleId2']
    if (Array.isArray(config.antiSpam.bypassRoles) && config.antiSpam.bypassRoles.length > 0) {
      const hasBypassRole = message.member.roles.cache.some(r => config.antiSpam.bypassRoles.includes(r.id));
      if (hasBypassRole) return;
    }

    // ------------------------------
    // 4) Hierarquia: se user tem cargo >= bot, não dá para moderar
    // ------------------------------
    if (message.member.roles.highest.position >= botMember.roles.highest.position) {
      return;
    }

    // ------------------------------
    // 5) Permissões do bot (timeout exige ModerateMembers)
    // ------------------------------
    const perms = message.channel.permissionsFor(botMember);
    if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) {
      // Sem permissão não adianta continuar (evita spam de erros)
      return;
    }

    // ------------------------------
    // 6) Anti-loop: se já aplicámos ação há pouco tempo, ignora
    // ------------------------------
    const prev = messageMap.get(key);
    if (prev?.lastActionAt && now - prev.lastActionAt < safeActionCooldown) {
      return;
    }

    // ------------------------------
    // 7) Atualiza janela de timestamps
    // ------------------------------
    const data = prev || { timestamps: [], lastActionAt: 0 };

    // Mantém só timestamps dentro da janela
    data.timestamps = data.timestamps.filter(ts => now - ts < safeInterval);
    data.timestamps.push(now);
    messageMap.set(key, data);

    // Ainda não atingiu limite
    if (data.timestamps.length < safeMax) return;

    // Atingiu limite -> marca ação agora (anti-loop)
    data.lastActionAt = now;
    data.timestamps = []; // opcional: limpa para não “reativar” instantaneamente
    messageMap.set(key, data);

    // ------------------------------
    // 8) Se não dá para moderar, sai
    // ------------------------------
    if (!message.member.moderatable) {
      return;
    }

    // ------------------------------
    // 9) Aplicar timeout (mute)
    // ------------------------------
    await message.member.timeout(safeMute, 'Spam detected (AntiSpam)');

    // Feedback no canal (opcional)
    if (config.antiSpam.sendMessage !== false) {
      await message.channel
        .send(`🔇 ${message.author} has been muted for spam.`)
        .catch(() => null);
    }

    // ------------------------------
    // 10) Registar infração no MongoDB (via service)
    // ------------------------------
    // IMPORTANT: infractionsService deve existir e ter create()
    await infractionsService.create({
      client,
      guild,
      user: message.author,
      moderator: client.user,
      type: 'MUTE',
      reason: 'Spam / Flood detected',
      duration: safeMute
    });

    // ------------------------------
    // 11) Log (Discord + Dashboard)
    // ------------------------------
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

// src/systems/antiSpam.js
// ============================================================
// Anti-Spam / Flood protection (com Trust Score)
// ------------------------------------------------------------
// Faz:
// - Deteta flood (muitas mensagens num intervalo curto)
// - Aplica timeout (mute) automaticamente
// - Regista infração no MongoDB (infractionsService)
// - Regista log no Discord + Dashboard (logger)
// - Ajusta SEVERIDADE com base no trust do utilizador:
//
//   Trust logic aqui:
//   - Lê trust atual do utilizador (User model via warningsService)
//   - Se trust <= lowThreshold  → precisa de MENOS mensagens para levar mute
//                                e fica mutado por MAIS tempo
//   - Se trust >= highThreshold → tolerância ligeiramente maior
//                                (mute ligeiramente mais curto)
//
//   Penalização de trust por AntiSpam:
//   - Sempre que o AntiSpam muta alguém → warningsService.applyMutePenalty()
// ============================================================

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const infractionsService = require('./infractionsService');
const logger = require('./logger');
const warningsService = require('./warningsService'); // 🔐 trust / user state

// ============================================================
// Helpers de trust (locais ao AntiSpam)
// ============================================================
/**
 * Lê config.trust com defaults seguros.
 * Se não existir config.trust, usa valores por defeito.
 */
function getTrustConfig() {
  const cfg = config.trust || {};

  return {
    enabled: cfg.enabled !== false,              // por defeito: ligado

    base: cfg.base ?? 30,
    min: cfg.min ?? 0,
    max: cfg.max ?? 100,

    lowThreshold: cfg.lowThreshold ?? 10,        // abaixo disto = utilizador de "alto risco"
    highThreshold: cfg.highThreshold ?? 60,      // acima disto = utilizador "de confiança"

    // Como a trust influencia a SEVERIDADE no AntiSpam:
    lowTrustMessagesPenalty: cfg.lowTrustMessagesPenalty ?? 1,  // reduz nº de msgs toleradas
    lowTrustMuteMultiplier: cfg.lowTrustMuteMultiplier ?? 1.5,  // aumenta duração do mute
    highTrustMuteMultiplier: cfg.highTrustMuteMultiplier ?? 0.8 // reduz duração do mute
  };
}

/**
 * Ajusta quantas mensagens são precisas para o AntiSpam castigar,
 * com base na trust do utilizador.
 */
function getEffectiveMaxMessages(baseMax, trustCfg, trustValue) {
  if (!trustCfg.enabled) return baseMax;

  const t = Number.isFinite(trustValue) ? trustValue : trustCfg.base;
  let effective = baseMax;

  // Trust baixa → menos mensagens até levar mute
  if (t <= trustCfg.lowThreshold) {
    effective = Math.max(
      3, // nunca menos que 3 mensagens, para evitar castigos absurdos
      baseMax - trustCfg.lowTrustMessagesPenalty
    );
  }

  // (Opcional) poderias dar bónus para trust alta (ex: +1 msg), se quiseres no futuro

  return effective;
}

/**
 * Ajusta duração do mute com base na trust.
 */
function getEffectiveMuteDuration(baseMs, trustCfg, trustValue) {
  if (!trustCfg.enabled) return baseMs;

  const t = Number.isFinite(trustValue) ? trustValue : trustCfg.base;
  let duration = baseMs;

  if (t <= trustCfg.lowThreshold) {
    // Utilizador problemático → mute mais longo
    duration = Math.round(baseMs * trustCfg.lowTrustMuteMultiplier);
  } else if (t >= trustCfg.highThreshold) {
    // Utilizador com bom histórico → leve “desconto” no mute
    duration = Math.round(baseMs * trustCfg.highTrustMuteMultiplier);
  }

  // Limites de segurança (Discord máx 28 dias)
  const MIN_MS = 30 * 1000;
  const MAX_MS = 28 * 24 * 60 * 60 * 1000;

  if (!Number.isFinite(duration) || duration < MIN_MS) duration = MIN_MS;
  if (duration > MAX_MS) duration = MAX_MS;

  return duration;
}

// ============================================================
// Estrutura em memória do AntiSpam
// ============================================================
// key: `${guildId}:${userId}` -> { timestamps: number[], lastActionAt: number }
const messageMap = new Map();

// cleanup periódico para evitar crescer memória
const CLEANUP_EVERY_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of messageMap.entries()) {
    const lastTs = data?.timestamps?.[data.timestamps.length - 1];
    if (!lastTs || now - lastTs > 5 * 60_000) {
      messageMap.delete(key);
    }
  }
}, CLEANUP_EVERY_MS).unref?.();

// ============================================================
// Handler principal AntiSpam
// ============================================================
module.exports = async function antiSpam(message, client) {
  try {
    // ------------------------------
    // Validações básicas
    // ------------------------------
    if (!config.antiSpam?.enabled) return;
    if (!message?.guild) return;
    if (!message?.author || message.author.bot) return;
    if (!message?.member) return;

    const guild = message.guild;
    const botMember = guild.members.me;
    if (!botMember) return;

    const now = Date.now();
    const key = `${guild.id}:${message.author.id}`;

    // ------------------------------
    // Config AntiSpam (com defaults seguros)
    // ------------------------------
    const intervalMs = Number(config.antiSpam.interval ?? 7000);
    const maxMessages = Number(config.antiSpam.maxMessages ?? 6);
    const muteDurationMs = Number(config.antiSpam.muteDuration ?? 60_000);
    const actionCooldownMs = Number(config.antiSpam.actionCooldown ?? 60_000);

    const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 500 ? intervalMs : 7000;
    const safeMaxBase = Number.isFinite(maxMessages) && maxMessages >= 3 ? maxMessages : 6;
    const safeMuteBase = Number.isFinite(muteDurationMs) && muteDurationMs >= 5_000 ? muteDurationMs : 60_000;
    const safeActionCooldown = Number.isFinite(actionCooldownMs) && actionCooldownMs >= 5_000
      ? actionCooldownMs
      : 60_000;

    // ------------------------------
    // Trust (ler trust atual do utilizador)
    // ------------------------------
    const trustCfg = getTrustConfig();
    let trustValue = trustCfg.base;
    let dbUserBefore = null;

    try {
      // Garante que o user existe na DB (User model)
      dbUserBefore = await warningsService.getOrCreateUser(guild.id, message.author.id);
      if (dbUserBefore && Number.isFinite(dbUserBefore.trust)) {
        trustValue = dbUserBefore.trust;
      }
    } catch (e) {
      console.error('[antiSpam] warningsService.getOrCreateUser error:', e);
    }

    // Ajustar número de mensagens necessárias com base na trust
    const effectiveMaxMessages = getEffectiveMaxMessages(
      safeMaxBase,
      trustCfg,
      trustValue
    );

    // ------------------------------
    // Bypass de admins (opcional, via config)
    // ------------------------------
    const bypassAdmins = config.antiSpam.bypassAdmins ?? true;
    if (bypassAdmins && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    // Bypass por roles (config.antiSpam.bypassRoles)
    if (Array.isArray(config.antiSpam.bypassRoles) && config.antiSpam.bypassRoles.length > 0) {
      const hasBypassRole = message.member.roles.cache.some(r =>
        config.antiSpam.bypassRoles.includes(r.id)
      );
      if (hasBypassRole) return;
    }

    // ------------------------------
    // Hierarquia / permissões
    // ------------------------------
    // user com cargo >= bot → não dá para moderar
    if (message.member.roles.highest.position >= botMember.roles.highest.position) return;

    // permissão do bot: timeout (ModerateMembers)
    const perms = message.channel.permissionsFor(botMember);
    if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) return;

    // ------------------------------
    // Anti-loop: não punir mesmo user em loop
    // ------------------------------
    const prev = messageMap.get(key);
    if (prev?.lastActionAt && now - prev.lastActionAt < safeActionCooldown) return;

    // ------------------------------
    // Atualizar timestamps dentro da janela
    // ------------------------------
    const data = prev || { timestamps: [], lastActionAt: 0 };

    // Mantém só mensagens dentro do intervalo
    data.timestamps = data.timestamps.filter(ts => now - ts < safeInterval);
    data.timestamps.push(now);

    messageMap.set(key, data);

    // Ainda não atingiu o limite dinâmico → sai
    if (data.timestamps.length < effectiveMaxMessages) return;

    // --------------------------------------------------------
    // Atingiu limite de flood → aplicar ação
    // --------------------------------------------------------
    data.lastActionAt = now;
    data.timestamps = [];
    messageMap.set(key, data);

    if (!message.member.moderatable) return;

    // Ajustar duração do mute com base na trust
    const effectiveMute = getEffectiveMuteDuration(
      safeMuteBase,
      trustCfg,
      trustValue
    );

    // Aplicar timeout
    await message.member.timeout(
      effectiveMute,
      'Spam detected (AntiSpam)'
    );

    // Feedback no canal
    if (config.antiSpam.sendMessage !== false) {
      await message.channel
        .send(`🔇 ${message.author} has been muted for spam.`)
        .catch(() => null);
    }

    // --------------------------------------------------------
    // Trust: penalização por MUTE (AntiSpam)
    // --------------------------------------------------------
    let dbUserAfter = null;
    try {
      if (typeof warningsService.applyMutePenalty === 'function') {
        dbUserAfter = await warningsService.applyMutePenalty(guild.id, message.author.id);
      } else {
        // fallback: ao menos garante que o user existe
        dbUserAfter = await warningsService.getOrCreateUser(guild.id, message.author.id);
      }
    } catch (e) {
      console.error('[antiSpam] warningsService.applyMutePenalty error:', e);
    }

    const trustAfter = dbUserAfter?.trust ?? trustValue;

    // --------------------------------------------------------
    // Registar infração no Mongo
    // --------------------------------------------------------
    await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'MUTE',
      reason: 'Spam / Flood detected',
      duration: effectiveMute
    }).catch(() => null);

    // --------------------------------------------------------
    // Log no Discord + Dashboard
    // --------------------------------------------------------
    await logger(
      client,
      'Anti-Spam Mute',
      message.author,
      client.user,
      `User muted for spam.\n` +
      `Duration: **${Math.round(effectiveMute / 1000)}s**\n` +
      `Threshold: **${effectiveMaxMessages} msgs / ${safeInterval}ms**\n` +
      (trustCfg.enabled
        ? `Trust after mute: **${trustAfter}/${trustCfg.max}**`
        : ''),
      guild
    );

  } catch (err) {
    console.error('[antiSpam] Error:', err);
  }
};

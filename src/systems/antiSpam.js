// src/systems/antiSpam.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const infractionsService = require('./infractionsService');
const logger = require('./logger');
const warningsService = require('./warningsService');
const { t } = require('./i18n');

function getTrustConfig() {
  const cfg = config.trust || {};

  return {
    enabled: cfg.enabled !== false,

    base: cfg.base ?? 30,
    min: cfg.min ?? 0,
    max: cfg.max ?? 100,

    lowThreshold: cfg.lowThreshold ?? 10,
    highThreshold: cfg.highThreshold ?? 60,

    lowTrustMessagesPenalty: cfg.lowTrustMessagesPenalty ?? 1,
    lowTrustMuteMultiplier: cfg.lowTrustMuteMultiplier ?? 1.5,
    highTrustMuteMultiplier: cfg.highTrustMuteMultiplier ?? 0.8
  };
}

function getEffectiveMaxMessages(baseMax, trustCfg, trustValue) {
  if (!trustCfg.enabled) return baseMax;

  const t = Number.isFinite(trustValue) ? trustValue : trustCfg.base;
  let effective = baseMax;

  if (t <= trustCfg.lowThreshold) {
    effective = Math.max(
      3,
      baseMax - trustCfg.lowTrustMessagesPenalty
    );
  }

  return effective;
}

function getEffectiveMuteDuration(baseMs, trustCfg, trustValue) {
  if (!trustCfg.enabled) return baseMs;

  const t = Number.isFinite(trustValue) ? trustValue : trustCfg.base;
  let duration = baseMs;

  if (t <= trustCfg.lowThreshold) {
    duration = Math.round(baseMs * trustCfg.lowTrustMuteMultiplier);
  } else if (t >= trustCfg.highThreshold) {
    duration = Math.round(baseMs * trustCfg.highTrustMuteMultiplier);
  }

  const MIN_MS = 30 * 1000;
  const MAX_MS = 28 * 24 * 60 * 60 * 1000;

  if (!Number.isFinite(duration) || duration < MIN_MS) duration = MIN_MS;
  if (duration > MAX_MS) duration = MAX_MS;

  return duration;
}

// ------------------------
// Helpers conteúdo / similaridade
// ------------------------
function normalizeContent(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/https?:\/\/\S+/gi, '')                 // remove links
    .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')         // emojis custom
    .replace(/[^\w\s]/g, '')                         // pontuação
    .replace(/\s+/g, ' ')                            // espaços múltiplos
    .trim()
    .toLowerCase();
}

/**
 * Similaridade muito simples (posição a posição).
 * 1 = igual, 0 = nada a ver.
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const len = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  let same = 0;

  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) same++;
  }

  return same / len;
}

// ------------------------
// Estrutura em memória
// messageMap key: guildId:userId
// value: { entries: [{ts, content}], lastActionAt }
// ------------------------
const messageMap = new Map();

const CLEANUP_EVERY_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of messageMap.entries()) {
    const last = data?.entries?.[data.entries.length - 1];
    const lastTs = last?.ts;
    if (!lastTs || now - lastTs > 5 * 60_000) {
      messageMap.delete(key);
    }
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

    const now = Date.now();
    const key = `${guild.id}:${message.author.id}`;

    const baseCfg = config.antiSpam || {};
    const channelOverride = baseCfg.channels?.[message.channel.id] || null;

    const intervalMs = Number(channelOverride?.interval ?? baseCfg.interval ?? 7000);
    const maxMessages = Number(channelOverride?.maxMessages ?? baseCfg.maxMessages ?? 6);
    const muteDurationMs = Number(channelOverride?.muteDuration ?? baseCfg.muteDuration ?? 60_000);
    const actionCooldownMs = Number(channelOverride?.actionCooldown ?? baseCfg.actionCooldown ?? 60_000);

    const minLength = Number(baseCfg.minLength ?? 6);
    const ignoreAttachments = baseCfg.ignoreAttachments ?? true;
    const similarityThreshold = Number(baseCfg.similarityThreshold ?? 0.8);

    const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 500 ? intervalMs : 7000;
    const safeMaxBase = Number.isFinite(maxMessages) && maxMessages >= 3 ? maxMessages : 6;
    const safeMuteBase = Number.isFinite(muteDurationMs) && muteDurationMs >= 5_000 ? muteDurationMs : 60_000;
    const safeActionCooldown = Number.isFinite(actionCooldownMs) && actionCooldownMs >= 5_000
      ? actionCooldownMs
      : 60_000;
    const safeMinLen = Number.isFinite(minLength) && minLength >= 1 ? minLength : 6;
    const safeSim = Number.isFinite(similarityThreshold) && similarityThreshold > 0 && similarityThreshold <= 1
      ? similarityThreshold
      : 0.8;

    const trustCfg = getTrustConfig();
    let trustValue = trustCfg.base;
    let dbUserBefore = null;

    try {
      dbUserBefore = await warningsService.getOrCreateUser(guild.id, message.author.id);
      if (dbUserBefore && Number.isFinite(dbUserBefore.trust)) {
        trustValue = dbUserBefore.trust;
      }
    } catch (e) {
      console.error('[antiSpam] warningsService.getOrCreateUser error:', e);
    }

    const effectiveMaxMessages = getEffectiveMaxMessages(
      safeMaxBase,
      trustCfg,
      trustValue
    );

    const bypassAdmins = baseCfg.bypassAdmins ?? true;
    if (bypassAdmins && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    if (Array.isArray(baseCfg.bypassRoles) && baseCfg.bypassRoles.length > 0) {
      const hasBypassRole = message.member.roles.cache.some(r =>
        baseCfg.bypassRoles.includes(r.id)
      );
      if (hasBypassRole) return;
    }

    if (message.member.roles.highest.position >= botMember.roles.highest.position) return;

    const perms = message.channel.permissionsFor(botMember);
    if (!perms?.has(PermissionsBitField.Flags.ModerateMembers)) return;

    // Ignorar mensagens com anexos/imagens se configurado
    if (ignoreAttachments && message.attachments && message.attachments.size > 0) {
      return;
    }

    const normalized = normalizeContent(message.content);
    if (!normalized || normalized.length < safeMinLen) {
      return;
    }

    const prev = messageMap.get(key);
    if (prev?.lastActionAt && now - prev.lastActionAt < safeActionCooldown) return;

    const data = prev || { entries: [], lastActionAt: 0 };
    data.entries = Array.isArray(data.entries) ? data.entries : [];

    data.entries = data.entries.filter(e => now - e.ts < safeInterval);
    data.entries.push({ ts: now, content: normalized });

    messageMap.set(key, data);

    let similarCount = 0;
    for (const entry of data.entries) {
      if (similarity(normalized, entry.content) >= safeSim) {
        similarCount++;
      }
    }

    if (similarCount < effectiveMaxMessages) return;

    data.lastActionAt = now;
    data.entries = [];
    messageMap.set(key, data);

    if (!message.member.moderatable) return;

    const effectiveMute = getEffectiveMuteDuration(
      safeMuteBase,
      trustCfg,
      trustValue
    );

    await message.member.timeout(effectiveMute, t('antispam.muteReason'));

    if (baseCfg.sendMessage !== false) {
      await message.channel
        .send(t('antispam.mutePublic', null, { userMention: `${message.author}` }))
        .catch(() => null);
    }

    let dbUserAfter = null;
    try {
      if (typeof warningsService.applyMutePenalty === 'function') {
        dbUserAfter = await warningsService.applyMutePenalty(guild.id, message.author.id);
      } else {
        dbUserAfter = await warningsService.getOrCreateUser(guild.id, message.author.id);
      }
    } catch (e) {
      console.error('[antiSpam] warningsService.applyMutePenalty error:', e);
    }

    const trustAfter = dbUserAfter?.trust ?? trustValue;

    // Cria infraction MUTE com Case ID
    const inf = await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'MUTE',
      reason: t('antispam.muteReason'),
      duration: effectiveMute
    }).catch(() => null);

    const casePrefix = inf?.caseId ? `Case: **#${inf.caseId}**\n` : '';

    await logger(
      client,
      'Anti-Spam Mute',
      message.author,
      client.user,
      casePrefix + t('log.actions.antispamMute', null, {
        durationSeconds: Math.round(effectiveMute / 1000),
        threshold: effectiveMaxMessages,
        intervalMs: safeInterval,
        similarityPct: Math.round(safeSim * 100),
        trustAfter: trustCfg.enabled ? `${trustAfter}/${trustCfg.max}` : 'N/A'
      }),
      guild
    );

  } catch (err) {
    console.error('[antiSpam] Error:', err);
  }
};

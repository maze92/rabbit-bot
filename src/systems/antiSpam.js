// src/systems/antiSpam.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const infractionsService = require('./infractionsService');
const logger = require('./logger');
const warningsService = require('./warningsService');
const { t } = require('./i18n');
const {
  getTrustConfig,
  getEffectiveMaxMessages,
  getEffectiveMuteDuration
} = require('../utils/trust');
const { incrementAntiSpamActions } = require('./status');

// ------------------------
// Helpers conteúdo / similaridade
// ------------------------
function normalizeForSimilarity(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/https?:\/\/\S+/gi, '')                 // remove links
    .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')           // emojis custom
    .replace(/[`*_~>\-]+/g, ' ')                      // markdown / pontuação leve
    .replace(/[^\w\s]/g, ' ')                        // resto de pontuação
    .replace(/\s+/g, ' ')                             // espaços múltiplos
    .trim()
    .toLowerCase();
}

// Levenshtein distance (para similaridade fuzzy)
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const m = a.length;
  const n = b.length;
  const dp = new Array(n + 1);

  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,      // remoção
        dp[j - 1] + 1,  // inserção
        prev + cost     // substituição
      );
      prev = tmp;
    }
  }

  return dp[n];
}

function similarity(a, b) {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const maxLen = Math.max(na.length, nb.length);
  if (!maxLen) return 0;

  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

// ------------------------
// Estrutura em memória
// messageMap key: guildId:userId
// value: { entries: [{ts, content}], lastActionAt, spamStrike?: { count, firstAt } }
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
    // Se o AutoMod já tratou esta mensagem com uma ação punitiva, evita punir a dobrar
    if (message._autoModHandled && message._autoModActionTaken) return;

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

    // Soft actions (warn first, then mute on repeated spam)
    const softCfg = baseCfg.softActions || {};
    const softEnabled = softCfg.enabled !== false;
    const softStrikeWindowMs = Number(softCfg.strikeWindowMs ?? 10 * 60_000);
    const softStrikesToMute = Number(softCfg.strikesToMute ?? 2);

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

    const normalized = normalizeForSimilarity(message.content);
    if (!normalized || normalized.length < safeMinLen) {
      return;
    }

    const prev = messageMap.get(key);
    if (prev?.lastActionAt && now - prev.lastActionAt < safeActionCooldown) return;

    const data = prev || { entries: [], lastActionAt: 0, spamStrike: null };
    data.entries = Array.isArray(data.entries) ? data.entries : [];

    data.entries = data.entries.filter(e => now - e.ts < safeInterval);
    data.entries.push({ ts: now, content: normalized });

    messageMap.set(key, data);

    const recentEntries = data.entries.filter((entry) => now - entry.ts <= safeInterval);

    let similarCount = 0;
    for (const entry of recentEntries) {
      if (similarity(normalized, entry.content) >= safeSim) {
        similarCount++;
      }
    }

    const totalRecent = recentEntries.length;

    if (similarCount < effectiveMaxMessages && totalRecent < effectiveMaxMessages * 2) return;

    // Trigger reached
    data.lastActionAt = now;
    data.entries = [];

    // Soft enforcement: first trigger => WARN, second within window => MUTE
    if (softEnabled) {
      const windowMs = Number.isFinite(softStrikeWindowMs) && softStrikeWindowMs >= 30_000
        ? softStrikeWindowMs
        : 10 * 60_000;
      const strikesToMute = Number.isFinite(softStrikesToMute) && softStrikesToMute >= 2
        ? Math.floor(softStrikesToMute)
        : 2;

      const strike = data.spamStrike || { count: 0, firstAt: now };
      if (!strike.firstAt || now - strike.firstAt > windowMs) {
        strike.count = 0;
        strike.firstAt = now;
      }
      strike.count += 1;
      data.spamStrike = strike;
      messageMap.set(key, data);

      if (strike.count < strikesToMute) {
        // WARN-only path
        const reason = t('antispam.warnReason');
        const maxWarnings = config.maxWarnings ?? 3;

        let dbWarn = null;
        try {
          dbWarn = await warningsService.addWarning(guild.id, message.author.id, 1);
        } catch (e) {
          console.error('[antiSpam] warningsService.addWarning error:', e);
        }

        const warnings = dbWarn?.warnings ?? (dbUserBefore?.warnings ?? 0) + 1;

        if (baseCfg.sendMessage !== false) {
          await message.channel
            .send(t('antispam.warnPublic', null, { userMention: `${message.author}`, warnings, maxWarnings }))
            .catch(() => null);
        }

        const inf = await infractionsService.create({
          guild,
          user: message.author,
          moderator: client.user,
          type: 'WARN',
          reason,
          duration: null,
          source: 'antispam'
        }).catch(() => null);

        const casePrefix = inf?.caseId ? `Case: **#${inf.caseId}**\n` : '';

        const trustAfter = dbWarn?.trust ?? trustValue;

        await logger(
          client,
          'Anti-Spam Warn',
          message.author,
          client.user,
          casePrefix + t('log.actions.antispamWarn', null, {
            warnings,
            maxWarnings,
            threshold: effectiveMaxMessages,
            intervalMs: safeInterval,
            similarityPct: Math.round(safeSim * 100),
            trustAfter: trustCfg.enabled ? `${trustAfter}/${trustCfg.max}` : 'N/A'
          }),
          guild
        );

        try { incrementAntiSpamActions(); } catch {}
        return;
      }

      // Next strike => mute, then reset strike tracking
      data.spamStrike = { count: 0, firstAt: now };
    }

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
      duration: effectiveMute,
      source: 'antispam'
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

    try { incrementAntiSpamActions(); } catch {}

  } catch (err) {
    console.error('[antiSpam] Error:', err);
  }
};


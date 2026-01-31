// src/utils/trust.js

const config = require('../config/defaultConfig');
const { t } = require('../systems/i18n');

function getTrustConfig() {
  const cfg = config.trust || {};

  return {
    // base on/off
    enabled: cfg.enabled !== false,

    // base range
    base: cfg.base ?? 30,
    min: cfg.min ?? 0,
    max: cfg.max ?? 100,

    // penalties
    warnPenalty: cfg.warnPenalty ?? 5,
    mutePenalty: cfg.mutePenalty ?? 15,

    // regen
    regenPerDay: cfg.regenPerDay ?? 1,
    regenMaxDays: cfg.regenMaxDays ?? 30,

    // thresholds
    lowThreshold: cfg.lowThreshold ?? 10,
    highThreshold: cfg.highThreshold ?? 60,

    // dynamic penalties / bonuses
    lowTrustWarningsPenalty: cfg.lowTrustWarningsPenalty ?? 1,
    lowTrustMessagesPenalty: cfg.lowTrustMessagesPenalty ?? 1,
    highTrustMessagesBonus: cfg.highTrustMessagesBonus ?? 0,

    lowTrustMuteMultiplier: cfg.lowTrustMuteMultiplier ?? 1.5,
    highTrustMuteMultiplier: cfg.highTrustMuteMultiplier ?? 0.8
  };
}

function getTrustLabel(trust, trustCfg) {
  const cfg = trustCfg || getTrustConfig();
  if (!cfg.enabled) return 'N/A';

  const trustValue = Number.isFinite(trust) ? trust : cfg.base;

  if (trustValue <= cfg.lowThreshold) return t('log.trustRisk.high');
  if (trustValue >= cfg.highThreshold) return t('log.trustRisk.low');
  return t('log.trustRisk.medium');
}

function getEffectiveMaxWithPenalty(baseMax, trustCfg, trustValue, options = {}) {
  const cfg = trustCfg || getTrustConfig();
  if (!cfg.enabled) return baseMax;

  const { penaltyKey, minFloor = 1 } = options;
  const tValue = Number.isFinite(trustValue) ? trustValue : cfg.base;

  let effective = baseMax;

  if (tValue <= cfg.lowThreshold && penaltyKey) {
    const penalty = Number(cfg[penaltyKey] ?? 0);
    if (Number.isFinite(penalty) && penalty > 0) {
      effective = Math.max(minFloor, baseMax - penalty);
    }
  }

  return effective;
}

function getEffectiveMaxWarnings(baseMaxWarnings, trustCfg, trustValue) {
  return getEffectiveMaxWithPenalty(baseMaxWarnings, trustCfg, trustValue, {
    penaltyKey: 'lowTrustWarningsPenalty',
    minFloor: 1
  });
}

function getEffectiveMaxMessages(baseMaxMessages, trustCfg, trustValue) {
  const cfg = trustCfg || getTrustConfig();
  if (!cfg.enabled) return baseMaxMessages;

  const tValue = Number.isFinite(trustValue) ? trustValue : cfg.base;
  let effective = baseMaxMessages;

  if (tValue <= cfg.lowThreshold) {
    const penalty = Number(cfg.lowTrustMessagesPenalty ?? 0);
    if (Number.isFinite(penalty) && penalty > 0) {
      effective = Math.max(1, baseMaxMessages - penalty);
    }
  } else if (tValue >= cfg.highThreshold) {
    const bonus = Number(cfg.highTrustMessagesBonus ?? 0);
    if (Number.isFinite(bonus) && bonus > 0) {
      effective = effective + bonus;
    }
  }

  return effective;
}

function getEffectiveMuteDuration(baseMs, trustCfg, trustValue) {
  const cfg = trustCfg || getTrustConfig();
  if (!cfg.enabled) return baseMs;

  const tValue = Number.isFinite(trustValue) ? trustValue : cfg.base;
  let duration = baseMs;

  if (tValue <= cfg.lowThreshold) {
    duration = Math.round(baseMs * cfg.lowTrustMuteMultiplier);
  } else if (tValue >= cfg.highThreshold) {
    duration = Math.round(baseMs * cfg.highTrustMuteMultiplier);
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_MS = 30 * 1000;
  const MAX_MS = 28 * DAY_MS;

  if (!Number.isFinite(duration) || duration < MIN_MS) duration = MIN_MS;
  if (duration > MAX_MS) duration = MAX_MS;

  return duration;
}

module.exports = {
  getTrustConfig,
  getTrustLabel,
  getEffectiveMaxWarnings,
  getEffectiveMaxMessages,
  getEffectiveMuteDuration
};

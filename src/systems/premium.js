// src/systems/premium.js
//
// Modelo premium por servidor: os módulos "extra" só funcionam com premium
// ativo (ativado por doação). Este ficheiro é o único ponto de verdade sobre
// *que* módulos são premium e sobre *se* o premium está ativo num servidor.

const { getGuildConfig } = require('./guildConfigService');

// Módulos que exigem premium. As chaves têm de coincidir com os audit actions
// usados nas rotas (ver src/dashboard/routes/*) para o gate ser consistente.
const PREMIUM_MODULES = ['gamenews', 'tempvoice', 'tickets', 'trust', 'giveaways'];

function isPremiumModule(name) {
  return PREMIUM_MODULES.includes(String(name || '').toLowerCase());
}

/**
 * Normaliza o bloco `premium` da GuildConfig para o formato usado na UI/API.
 * @returns {{enabled: boolean, until: Date|null, note: string|null, activatedAt: Date|null, active: boolean}}
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const PREMIUM_GRACE_DAYS = (() => {
  const n = Number(process.env.PREMIUM_GRACE_DAYS);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 30) : 3;
})();

function normalizePremium(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};

  let until = null;
  if (src.until) {
    const d = src.until instanceof Date ? src.until : new Date(src.until);
    if (!Number.isNaN(d.getTime())) until = d;
  }

  let activatedAt = null;
  if (src.activatedAt) {
    const d = src.activatedAt instanceof Date ? src.activatedAt : new Date(src.activatedAt);
    if (!Number.isNaN(d.getTime())) activatedAt = d;
  }

  const enabled = src.enabled === true;
  // `until` a null significa acesso permanente (doação única).
  // Após expirar, os módulos continuam ativos durante PREMIUM_GRACE_DAYS.
  const nowMs = Date.now();
  const graceUntil = until ? new Date(until.getTime() + PREMIUM_GRACE_DAYS * DAY_MS) : null;
  const active = enabled && (!until || graceUntil.getTime() > nowMs);
  const inGrace = enabled && !!until && until.getTime() <= nowMs && graceUntil.getTime() > nowMs;

  return {
    enabled,
    until,
    inGrace,
    graceUntil,
    note: typeof src.note === 'string' && src.note.trim() ? src.note.trim().slice(0, 200) : null,
    activatedAt,
    active
  };
}

function isPremiumActive(raw) {
  return normalizePremium(raw).active;
}

async function getPremium(guildId) {
  const cfg = await getGuildConfig(guildId);
  return normalizePremium(cfg && cfg.premium);
}

async function isGuildPremium(guildId) {
  return (await getPremium(guildId)).active;
}

module.exports = {
  PREMIUM_MODULES,
  PREMIUM_GRACE_DAYS,
  isPremiumModule,
  normalizePremium,
  isPremiumActive,
  getPremium,
  isGuildPremium
};

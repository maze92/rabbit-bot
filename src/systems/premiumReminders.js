// src/systems/premiumReminders.js
//
// DMs the guild owner when the Premium license is about to expire (7 days,
// 1 day) and once it has expired (during the grace period).

const { normalizePremium } = require('./premium');

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

function pickReminder(rawPremium, now = Date.now()) {
  const p = normalizePremium(rawPremium);
  if (!p.enabled || !p.until) return null;
  const left = p.until.getTime() - now;
  if (left <= 0) return p.graceUntil && p.graceUntil.getTime() > now ? 'expired' : null;
  if (left <= DAY) return '1d';
  if (left <= 7 * DAY) return '7d';
  return null;
}

function reminderKey(kind, until) {
  return `${kind}:${new Date(until).toISOString()}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildMessage(kind, guildName, premium, baseUrl) {
  const p = normalizePremium(premium);
  const link = baseUrl ? `\nRenovar: ${baseUrl.replace(/\/$/, '')}/` : '';
  if (kind === 'expired') {
    return (
      `⚠️ O Premium do servidor **${guildName}** expirou a ${formatDate(p.until)}. ` +
      `Os módulos Premium continuam ativos até ${formatDate(p.graceUntil)}.${link}`
    );
  }
  const when = kind === '1d' ? 'amanhã' : 'dentro de 7 dias';
  return `⏳ O Premium do servidor **${guildName}** expira ${when} (${formatDate(p.until)}).${link}`;
}

async function runOnce(client, { GuildConfig, now = Date.now(), baseUrl = process.env.PUBLIC_BASE_URL || '' } = {}) {
  if (!client || !client.guilds || !GuildConfig) return 0;
  const docs = await GuildConfig.find({
    'premium.enabled': true,
    'premium.until': { $ne: null, $lte: new Date(now + 7 * DAY) }
  })
    .select('guildId premium')
    .lean();

  let sent = 0;
  for (const doc of docs || []) {
    const kind = pickReminder(doc.premium, now);
    if (!kind) continue;
    const key = reminderKey(kind, doc.premium.until);
    if (doc.premium.lastReminder === key) continue;
    const guild = client.guilds.cache.get(doc.guildId);
    if (!guild) continue;
    try {
      const owner = await guild.fetchOwner();
      await owner.send(buildMessage(kind, guild.name, doc.premium, baseUrl));
      sent += 1;
    } catch (err) {
      console.warn(`[PremiumReminders] Could not DM owner of ${doc.guildId}:`, err?.message || err);
    }
    await GuildConfig.updateOne({ guildId: doc.guildId }, { $set: { 'premium.lastReminder': key } });
  }
  return sent;
}

function startPremiumReminders(client, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const GuildConfig = require('../database/models/GuildConfig');
  const tick = () =>
    runOnce(client, { GuildConfig }).catch((err) => console.warn('[PremiumReminders]', err?.message || err));
  tick();
  setInterval(tick, intervalMs).unref?.();
}

module.exports = { pickReminder, reminderKey, buildMessage, runOnce, startPremiumReminders };

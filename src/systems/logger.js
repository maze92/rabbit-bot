// src/systems/logger.js

const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');
const dashboardBridge = require('./dashboardBridge');
const GuildConfig = require('../database/models/GuildConfig');
const { t } = require('./i18n');

function normalizeActor(actor) {
  if (!actor) return null;

  const u = actor.user ?? actor;
  if (!u?.id) return null;

  return {
    id: u.id,
    tag: u.tag || `${u.username ?? 'Unknown'}#0000`
  };
}

function resolveGuild(guild, user, executor) {
  return guild || user?.guild || executor?.guild || null;
}

function decorateTitle(title) {
  const t = String(title || '').trim();
  const low = t.toLowerCase();

  if (low.includes('warn')) {
    if (low.includes('automatic') || low.includes('automod') || low.includes('auto')) {
      return `🤖⚠️ ${t}`;
    }
    return `⚠️ ${t}`;
  }

  if (low.includes('mute') || low.includes('timeout')) {
    if (low.includes('automatic') || low.includes('automod') || low.includes('auto')) {
      return `🤖🔇 ${t}`;
    }
    return `🔇 ${t}`;
  }

  return t || 'Log';
}

/**
 * Adiciona label de risco ao texto de Trust no description:
 * - Trust: **8/100** → Trust: **8/100** (High risk)
 * - Trust after mute: **72/100** → ... (Low risk)
 */
function decorateDescriptionWithTrustLabel(description) {
  if (!description) return description;

  const trustCfg = config.trust || {};
  if (trustCfg.enabled === false) return description;

  const lowThreshold = trustCfg.lowThreshold ?? 10;
  const highThreshold = trustCfg.highThreshold ?? 60;
  const maxDefault = trustCfg.max ?? 100;

  // evita duplicar se já tiver algum label (EN/PT)
  if (
    description.includes('(High risk)') ||
    description.includes('(Medium risk)') ||
    description.includes('(Low risk)') ||
    description.includes('(Risco elevado)') ||
    description.includes('(Risco médio)') ||
    description.includes('(Risco baixo)')
  ) return description;

  // Match tanto "Trust:" como "Trust after mute:"
  const regex = /(Trust(?: after mute)?):\s*\*\*(\d+)(?:\/(\d+))?\*\*/i;
  const match = description.match(regex);
  if (!match) return description;

  const labelPrefix = match[1];
  const value = Number(match[2]);
  const max = match[3] ? Number(match[3]) : maxDefault;

  if (!Number.isFinite(value)) return description;

  let riskKey = 'medium';
  if (value <= lowThreshold) riskKey = 'high';
  else if (value >= highThreshold) riskKey = 'low';

  const riskLabel = t(`log.trustRisk.${riskKey}`);

  const replacement = `${labelPrefix}: **${value}/${max}** (${riskLabel})`;

  return description.replace(regex, replacement);
}

module.exports = async function logger(client, title, user, executor, description, guild) {
  try {
    const resolvedGuild = resolveGuild(guild, user, executor);
    if (!resolvedGuild) return;

    const logChannelName = config.logChannelName || 'log-bot';

    // Cache simples por guild para evitar procurar o canal por nome em todos os logs
    if (!module.exports._channelCache) {
      module.exports._channelCache = new Map();
    }

    const cacheKey = `${resolvedGuild.id}:${logChannelName}`;
    let logChannel = module.exports._channelCache.get(cacheKey) || null;

    try {
      // Tenta usar GuildConfig.logChannelId, se existir
      if (!logChannel && GuildConfig) {
        const guildCfg = await GuildConfig.findOne({ guildId: resolvedGuild.id }).lean().catch(() => null);
        if (guildCfg?.logChannelId) {
          const byId = resolvedGuild.channels?.cache?.get(guildCfg.logChannelId);
          if (byId) {
            logChannel = byId;
          }
        }
      }
    } catch (err) {
      console.error('[Logger] Failed to read GuildConfig for log channel:', err);
    }

    if (!logChannel || !resolvedGuild.channels?.cache?.get(logChannel.id)) {
      logChannel = resolvedGuild.channels?.cache?.find((ch) => ch?.name === logChannelName) || null;
      if (logChannel) {
        module.exports._channelCache.set(cacheKey, logChannel);
      }
    }

    const nUser = normalizeActor(user);
    const nExec = normalizeActor(executor);
    const finalTitle = decorateTitle(title);

    const decoratedDescription = description
      ? decorateDescriptionWithTrustLabel(description)
      : '';

    let desc = '';
    if (nUser?.tag) desc += `👤 **${t('log.labels.user')}:** ${nUser.tag}\n`;
    if (nExec?.tag) desc += `🛠️ **${t('log.labels.executor')}:** ${nExec.tag}\n`;
    if (decoratedDescription) desc += `${decoratedDescription}`;

    const embed = new EmbedBuilder()
      .setTitle(finalTitle || 'Log')
      .setColor('Blue')
      .setDescription(desc || t('log.noDescription'))
      .setTimestamp(new Date());

    if (logChannel) {
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }

    // Enviar também para o dashboard (via bridge) se estiver configurado
    dashboardBridge.emit('log', {
      title: finalTitle || 'Log',
      user: nUser,
      executor: nExec,
      description: decoratedDescription || '',
      guild: { id: resolvedGuild.id, name: resolvedGuild.name },
      time: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Logger] Error:', err);
  }
};

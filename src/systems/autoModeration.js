// src/systems/autoModeration.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const logger = require('./logger');
const warningsService = require('./warningsService');
const infractionsService = require('./infractionsService');
const { t, tContext } = require('./i18n');
const {
  getGuildTrustConfig,
  getEffectiveMaxWarnings,
  getEffectiveMuteDuration,
  getAdaptiveMaxWarnings
} = require('../utils/trust');
const { incrementAutoModActions } = require('./status');

// Precompile banned-word regexes once at startup.
// Creating RegExp objects per message is expensive and scales poorly.
function buildBannedWordMatchers(cfg) {
  const words = [
    ...((cfg.bannedWords && cfg.bannedWords.pt) || []),
    ...((cfg.bannedWords && cfg.bannedWords.en) || [])
  ].filter(Boolean);

  const out = [];
  for (const w of words) {
    const raw = String(w).trim();
    if (!raw) continue;

    // Allow common leetspeak substitutions.
    const pattern = raw
      .replace(/a/gi, '[a4@]')
      .replace(/e/gi, '[e3]')
      .replace(/i/gi, '[i1!]')
      .replace(/o/gi, '[o0]')
      .replace(/u/gi, '[uü]')
      .replace(/s/gi, '[s5$]');

    try {
      out.push({ word: raw, re: new RegExp(`\\b${pattern}\\b`, 'i') });
    } catch {
      // ignore invalid regex patterns
    }
  }
  return out;
}

const BANNED_MATCHERS = buildBannedWordMatchers(config);

// DM helper is shared in src/utils/dm.js

function minutesFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60000));
}

async function buildWarnChannelMessage(message, { userMention, warnings, maxWarnings, reason }) {
  return tContext(message, 'automod.warnPublic', { userMention, warnings, maxWarnings, reason });
}

async function buildMuteChannelMessage(message, { userMention, minutes }) {
  return tContext(message, 'automod.mutePublic', { userMention, minutes });
}

function yesNo(v, lang) {
  // optional i18n keys; fallback to en
  const yes = t?.('common.yes', lang || null) || 'yes';
  const no = t?.('common.no', lang || null) || 'no';
  return v ? yes : no;
}

module.exports = async function autoModeration(message, client) {
  try {
    if (!message?.guild) return;
    if (!message?.content) return;
    if (message.author?.bot) return;
    if (!message.member) return;
    if (message._autoModHandled) return;
    message._autoModHandled = true;

    const guild = message.guild;
    const botMember = guild.members.me;
    if (!botMember) return;
    const lang = await require('./i18n').getGuildLang(guild.id);

    const trustCfg = await getGuildTrustConfig(guild.id);

    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    if (message.member.roles.highest.position >= botMember.roles.highest.position) {
      return;
    }

    const baseMaxWarnings = config.maxWarnings ?? 3;
    const baseMuteDuration = config.muteDuration ?? (10 * 60 * 1000);

    const cleanContent = message.content
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')
      .replace(/[^\w\s]/g, '')
      .toLowerCase();

    let foundWord = null;
    for (const m of BANNED_MATCHERS) {
      if (!m?.re) continue;
      if (m.re.test(cleanContent)) {
        foundWord = m.word;
        break;
      }
    }

    if (!foundWord) return;

    const perms = message.channel.permissionsFor(botMember);
    const canDelete = perms?.has(PermissionsBitField.Flags.ManageMessages);
    const canTimeout = perms?.has(PermissionsBitField.Flags.ModerateMembers);

    if (canDelete) {
      await message.delete().catch(() => null);
    }

    const dbUser = await warningsService.addWarning(guild.id, message.author.id, 1);

    const currentTrust = Number.isFinite(dbUser.trust)
      ? dbUser.trust
      : trustCfg.base;

    const effectiveMaxWarnings = getEffectiveMaxWarnings(
      baseMaxWarnings,
      trustCfg,
      currentTrust
    );

    // Camada adaptativa (opt-in): ajusta a tolerância ao estado geral do
    // servidor, medido pelo Trust médio. Sem amostra suficiente, mantém-se o
    // comportamento base do utilizador.
    let maxWarningsForGuild = effectiveMaxWarnings;
    if (trustCfg.adaptive?.enabled === true) {
      try {
        const stats = await warningsService.getGuildAverageTrust(guild.id);
        maxWarningsForGuild = getAdaptiveMaxWarnings(
          effectiveMaxWarnings,
          trustCfg,
          stats
        ).maxWarnings;
      } catch {
        // Falha do ajuste adaptativo nunca deve impedir a ação base.
      }
    }

    const warnReason = await tContext(message, 'automod.warnReasonGeneric');

    // Create WARN infraction with Case ID
    const infWarn = await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'WARN',
      reason: warnReason,
      duration: null,
      source: 'automod'
    }).catch(() => null);

    await message.channel.send({
      content: await buildWarnChannelMessage(message, {
        userMention: `${message.author}`,
        warnings: dbUser.warnings,
        maxWarnings: maxWarningsForGuild,
        reason: warnReason
      })
    }).catch(() => null);

    // DM-on-warn removido a pedido do owner

    const warnCasePrefix = infWarn?.caseId ? `Case: **#${infWarn.caseId}**\n` : '';
    await logger(
      client,
      'Automatic Warn',
      message.author,
      client.user,
      warnCasePrefix + await tContext(message, 'log.actions.automodWarn', {
        word: foundWord,
        warnings: dbUser.warnings,
        maxWarnings: maxWarningsForGuild,
        trust: trustCfg.enabled ? `${currentTrust}/${trustCfg.max}` : 'N/A',
        deleted: yesNo(canDelete, lang)
      }),
      guild
    );

    // Marcar que o AutoMod já aplicou uma ação punitiva
    message._autoModActionTaken = true;
    try { incrementAutoModActions(); } catch {}

    if (dbUser.warnings < maxWarningsForGuild) {
      return;
    }

    if (!canTimeout || !message.member.moderatable) return;

    const effectiveMute = getEffectiveMuteDuration(
      baseMuteDuration,
      trustCfg,
      currentTrust
    );

    const muteReason = await tContext(message, 'automod.muteReason');
    await message.member.timeout(effectiveMute, muteReason);

    // Create MUTE infraction with Case ID
    const infMute = await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'MUTE',
      reason: muteReason,
      duration: effectiveMute,
      source: 'automod'
    }).catch(() => null);

    let afterMuteUser = dbUser;
    try {
      afterMuteUser = await warningsService.applyMutePenalty(guild.id, message.author.id);
    } catch {
      // ignore
    }

    const trustAfterMute = Number.isFinite(afterMuteUser.trust)
      ? afterMuteUser.trust
      : currentTrust;

    const mins = minutesFromMs(effectiveMute);

    await message.channel.send(
      await buildMuteChannelMessage(message, {
        userMention: `${message.author}`,
        minutes: mins
      })
    ).catch(() => null);

    // DM-on-mute removido a pedido do owner

    const muteCasePrefix = infMute?.caseId ? `Case: **#${infMute.caseId}**\n` : '';
    await logger(
      client,
      'Automatic Mute',
      message.author,
      client.user,
      muteCasePrefix + await tContext(message, 'log.actions.automodMute', {
        minutes: mins,
        trustAfter: trustCfg.enabled ? `${trustAfterMute}/${trustCfg.max}` : 'N/A'
      }),
      guild
    );

    // Marcar que o AutoMod aplicou MUTE nesta mensagem
    message._autoModActionTaken = true;
    try { incrementAutoModActions(); } catch {}

    await warningsService.resetWarnings(guild.id, message.author.id).catch(() => null);

  } catch (err) {
    console.error('[AutoMod] Critical error:', err);
  }
};

// src/systems/autoModeration.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const logger = require('./logger');
const warningsService = require('./warningsService');
const infractionsService = require('./infractionsService');
const { t } = require('./i18n');
const { safeDM } = require('../utils/dm');
const {
  getTrustConfig,
  getEffectiveMaxWarnings,
  getEffectiveMuteDuration
} = require('../utils/trust');

// DM helper is shared in src/utils/dm.js

function minutesFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60000));
}

function buildWarnChannelMessage({ userMention, warnings, maxWarnings, reason }) {
  return t('automod.warnPublic', null, { userMention, warnings, maxWarnings, reason });
}

function buildWarnDMMessage({ guildName, reason, warnings, maxWarnings }) {
  // Reuse the manual warn DM format so users receive a consistent message
  return t('warn.dmText', null, { guildName, warnings, maxWarnings, reason });
}

function buildMuteChannelMessage({ userMention, minutes }) {
  return t('automod.mutePublic', null, { userMention, minutes });
}

function buildMuteDMMessage({ guildName, minutes }) {
  // Keep it short; no trust exposure
  const duration = `${minutes}m`;
  return t('mute.dmText', null, { guildName, duration, reason: t('automod.muteReason') });
}

function yesNo(v) {
  // optional i18n keys; fallback to en
  const yes = t?.('common.yes') || 'yes';
  const no = t?.('common.no') || 'no';
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

    const trustCfg = getTrustConfig();

    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    if (message.member.roles.highest.position >= botMember.roles.highest.position) {
      return;
    }

    const bannedWords = [
      ...(config.bannedWords?.pt || []),
      ...(config.bannedWords?.en || [])
    ];

    const baseMaxWarnings = config.maxWarnings ?? 3;
    const baseMuteDuration = config.muteDuration ?? (10 * 60 * 1000);

    const cleanContent = message.content
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')
      .replace(/[^\w\s]/g, '')
      .toLowerCase();

    const foundWord = bannedWords.find(word => {
      const pattern = String(word)
        .replace(/a/gi, '[a4@]')
        .replace(/e/gi, '[e3]')
        .replace(/i/gi, '[i1!]')
        .replace(/o/gi, '[o0]')
        .replace(/u/gi, '[uü]')
        .replace(/s/gi, '[s5$]');

      return new RegExp(`\\b${pattern}\\b`, 'i').test(cleanContent);
    });

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

    const warnReason = t('automod.warnReason', null, { word: foundWord });

    // Create WARN infraction with Case ID
    const infWarn = await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'WARN',
      reason: warnReason,
      duration: null
    }).catch(() => null);

    await message.channel.send({
      content: buildWarnChannelMessage({
        userMention: `${message.author}`,
        warnings: dbUser.warnings,
        maxWarnings: effectiveMaxWarnings,
        reason: warnReason
      })
    }).catch(() => null);

    if (config.notifications?.dmOnWarn) {
      const dmText = buildWarnDMMessage({
        guildName: guild.name,
        reason: warnReason,
        warnings: dbUser.warnings,
        maxWarnings: effectiveMaxWarnings
      });

      await safeDM(message.author, dmText);
    }

    const warnCasePrefix = infWarn?.caseId ? `Case: **#${infWarn.caseId}**\n` : '';
    await logger(
      client,
      'Automatic Warn',
      message.author,
      client.user,
      warnCasePrefix + t('log.actions.automodWarn', null, {
        word: foundWord,
        warnings: dbUser.warnings,
        maxWarnings: effectiveMaxWarnings,
        trust: trustCfg.enabled ? `${currentTrust}/${trustCfg.max}` : 'N/A',
        deleted: yesNo(canDelete)
      }),
      guild
    );

    // Marcar que o AutoMod já aplicou uma ação punitiva
    message._autoModActionTaken = true;

    if (dbUser.warnings < effectiveMaxWarnings) {
      return;
    }

    if (!canTimeout || !message.member.moderatable) return;

    const effectiveMute = getEffectiveMuteDuration(
      baseMuteDuration,
      trustCfg,
      currentTrust
    );

    await message.member.timeout(effectiveMute, t('automod.muteReason'));

    // Create MUTE infraction with Case ID
    const infMute = await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'MUTE',
      reason: t('automod.muteReason'),
      duration: effectiveMute
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
      buildMuteChannelMessage({
        userMention: `${message.author}`,
        minutes: mins
      })
    ).catch(() => null);

    if (config.notifications?.dmOnMute) {
      const dmText = buildMuteDMMessage({
        guildName: guild.name,
        minutes: mins
      });

      await safeDM(message.author, dmText);
    }

    const muteCasePrefix = infMute?.caseId ? `Case: **#${infMute.caseId}**\n` : '';
    await logger(
      client,
      'Automatic Mute',
      message.author,
      client.user,
      muteCasePrefix + t('log.actions.automodMute', null, {
        minutes: mins,
        trustAfter: trustCfg.enabled ? `${trustAfterMute}/${trustCfg.max}` : 'N/A'
      }),
      guild
    );

    // Marcar que o AutoMod aplicou MUTE nesta mensagem
    message._autoModActionTaken = true;

    await warningsService.resetWarnings(guild.id, message.author.id).catch(() => null);

  } catch (err) {
    console.error('[AutoMod] Critical error:', err);
  }
};


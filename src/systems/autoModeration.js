// src/systems/autoModeration.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const logger = require('./logger');
const warningsService = require('./warningsService');
const infractionsService = require('./infractionsService');

function getTrustConfig() {
  const cfg = config.trust || {};

  return {
    enabled: cfg.enabled !== false,

    base: cfg.base ?? 30,
    min: cfg.min ?? 0,
    max: cfg.max ?? 100,

    lowThreshold: cfg.lowThreshold ?? 10,
    highThreshold: cfg.highThreshold ?? 60,

    lowTrustWarningsPenalty: cfg.lowTrustWarningsPenalty ?? 1,
    lowTrustMuteMultiplier: cfg.lowTrustMuteMultiplier ?? 1.5,
    highTrustMuteMultiplier: cfg.highTrustMuteMultiplier ?? 0.8
  };
}

function getEffectiveMaxWarnings(baseMaxWarnings, trustCfg, trustValue) {
  if (!trustCfg.enabled) return baseMaxWarnings;

  const t = Number.isFinite(trustValue) ? trustValue : trustCfg.base;
  let effective = baseMaxWarnings;

  if (t <= trustCfg.lowThreshold) {
    effective = Math.max(
      1,
      baseMaxWarnings - trustCfg.lowTrustWarningsPenalty
    );
  }

  // (opcional futuro) Para trust alta podias dar +1 aviso:
  // if (t >= trustCfg.highThreshold) effective = baseMaxWarnings + 1;

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

  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_MS = 30 * 1000;
  const MAX_MS = 28 * DAY_MS;

  if (!Number.isFinite(duration) || duration < MIN_MS) duration = MIN_MS;
  if (duration > MAX_MS) duration = MAX_MS;

  return duration;
}

async function trySendDM(user, content) {
  try {
    if (!user) return;
    if (!content) return;
    await user.send({ content }).catch(() => null);
  } catch {
  }
}

function minutesFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60000));
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
    const baseMuteDuration = config.muteDuration ?? (10 * 60 * 1000); // 10 min

    const cleanContent = message.content
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

    await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'WARN',
      reason: `AutoMod detected banned word: ${foundWord}`,
      duration: null
    }).catch(() => null);

    const effectiveMaxWarnings = getEffectiveMaxWarnings(
      baseMaxWarnings,
      trustCfg,
      currentTrust
    );


    await message.channel.send({
      content:
        `⚠️ ${message.author}, inappropriate language is not allowed.\n` +
        `**Warning:** ${dbUser.warnings}/${effectiveMaxWarnings}\n` +
        (trustCfg.enabled
          ? `🔐 **Trust:** ${currentTrust}/${trustCfg.max}\n`
          : '')
    }).catch(() => null);

    if (config.notifications?.dmOnWarn) {
      const dmText =
        `⚠️ You received an **automatic WARN** on the server **${guild.name}**.\n` +
        `📝 Reason: **Inappropriate language** (detected word: "${foundWord}")\n` +
        `📌 Warnings: **${dbUser.warnings}/${effectiveMaxWarnings}**` +
        (trustCfg.enabled ? `\n🔐 Trust: **${currentTrust}/${trustCfg.max}**` : '');

      await trySendDM(message.author, dmText);
    }

    await logger(
      client,
      'Automatic Warn',
      message.author,
      client.user,
      `Word: **${foundWord}**\n` +
      `Warnings: **${dbUser.warnings}/${effectiveMaxWarnings}**\n` +
      (trustCfg.enabled ? `Trust: **${currentTrust}/${trustCfg.max}**\n` : '') +
      `Deleted: **${canDelete ? 'yes' : 'no'}**`,
      guild
    );

    if (dbUser.warnings < effectiveMaxWarnings) {
      return;
    }

    if (!canTimeout || !message.member.moderatable) return;

    const effectiveMute = getEffectiveMuteDuration(
      baseMuteDuration,
      trustCfg,
      currentTrust
    );

    await message.member.timeout(effectiveMute, 'AutoMod: exceeded warning limit');

    await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'MUTE',
      reason: 'AutoMod: exceeded warning limit',
      duration: effectiveMute
    }).catch(() => null);

    let afterMuteUser = dbUser;
    try {
      afterMuteUser = await warningsService.applyMutePenalty(guild.id, message.author.id);
    } catch {
    }

    const trustAfterMute = Number.isFinite(afterMuteUser.trust)
      ? afterMuteUser.trust
      : currentTrust;

    await message.channel.send(
      `🔇 ${message.author} has been muted for **${Math.round(effectiveMute / 60000)} minutes** due to repeated infractions.`
    ).catch(() => null);

    if (config.notifications?.dmOnMute) {
      const mins = minutesFromMs(effectiveMute);

      const dmText =
        `🔇 You were **automatically muted** on the server **${guild.name}**.\n` +
        `⏱️ Duration: **${mins} minutes**\n` +
        `📝 Reason: **Exceeded the warning limit**` +
        (trustCfg.enabled ? `\n🔐 Trust: **${trustAfterMute}/${trustCfg.max}**` : '');

      await trySendDM(message.author, dmText);
    }

    await logger(
      client,
      'Automatic Mute',
      message.author,
      client.user,
      `Duration: **${Math.round(effectiveMute / 60000)} minutes**\n` +
      (trustCfg.enabled ? `Trust after mute: **${trustAfterMute}/${trustCfg.max}**` : ''),
      guild
    );

    await warningsService.resetWarnings(guild.id, message.author.id).catch(() => null);

  } catch (err) {
    console.error('[AutoMod] Critical error:', err);
  }
};

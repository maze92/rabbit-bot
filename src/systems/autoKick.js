// src/systems/autoKick.js
//
// AutoKick (feature opcional): expulsa membros que acumulam demasiadas infrações.

const { getFeature } = require("./featuresService");
const logger = require("./logger");
const { PermissionsBitField } = require("discord.js");
const FOLLOW_UP_MUTE_SOURCES = ["automod", "automation", "slash-escalation"];

let Infraction = null;
try {
  Infraction = require("../database/models/Infraction");
} catch (err) {
  console.warn(
    "[autoKick] Infraction model not available:",
    err?.message || err,
  );
}

const kickingUsers = new Set();

function getAutoKickThreshold(value) {
  return Math.max(1, Number(value) || 1);
}

function buildAutoKickInfractionFilter(guildId, userId) {
  return {
    guildId,
    userId,
    $or: [
      { type: "WARN" },
      { type: "MUTE", source: { $nin: FOLLOW_UP_MUTE_SOURCES } },
    ],
  };
}

function shouldCheckAutoKickImmediately(type, source) {
  const normalizedType = String(type || "").toUpperCase();
  const normalizedSource = String(source || "").toLowerCase();
  if (normalizedType !== "WARN" && normalizedType !== "MUTE") return false;
  if (
    ["automod", "automation", "slash-escalation", "antispam"].includes(
      normalizedSource,
    )
  ) {
    return false;
  }
  return !(normalizedType === "WARN" && ["slash", "dashboard"].includes(normalizedSource));
}

function hasReachedAutoKickThreshold(config, infractionCount) {
  return (
    config?.enabled === true &&
    Number.isFinite(Number(infractionCount)) &&
    Number(infractionCount) >= getAutoKickThreshold(config.infractionsToKick)
  );
}

function isAutoKickEligible(botMember, member) {
  if (!botMember || !member || !member.kickable) return false;
  if (!botMember.permissions?.has?.(PermissionsBitField.Flags.KickMembers)) {
    return false;
  }
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) {
    return false;
  }
  return member.roles.highest.position < botMember.roles.highest.position;
}

async function checkAutoKick(client, guildId, userId) {
  const key = `${guildId}:${userId}`;
  if (kickingUsers.has(key)) return false;
  kickingUsers.add(key);

  try {
    if (!Infraction || !client) return;
    if (!guildId || !userId) return;

    const cfg = await getFeature(guildId, "autoKick");
    if (cfg?.enabled !== true) return;

    const limit = getAutoKickThreshold(cfg.infractionsToKick);

    // Count a WARN and its follow-up automatic MUTE as one incident.
    const total = await Infraction.countDocuments(
      buildAutoKickInfractionFilter(guildId, userId),
    ).catch(() => 0);
    if (!hasReachedAutoKickThreshold(cfg, total)) return false;

    const guild = client.guilds?.cache?.get(guildId);
    if (!guild) return false;

    const botMember =
      guild.members.me || (await guild.members.fetchMe().catch(() => null));
    const member =
      guild.members.cache.get(userId) ||
      (await guild.members.fetch(userId).catch(() => null));
    if (!isAutoKickEligible(botMember, member)) return false;

    const reason = `AutoKick: ${total} infrações (limite ${limit})`;
    try {
      await member.kick(reason);
      await logger(
        client,
        "AutoKick",
        { id: userId },
        client.user,
        `Membro expulso automaticamente.\nInfrações: **${total}/${limit}**`,
        guild,
      );
      return true;
    } catch (err) {
      console.error("[autoKick] Failed to kick user:", err);
      return false;
    }
  } catch (err) {
    console.error("[autoKick] checkAutoKick error:", err);
    return false;
  } finally {
    kickingUsers.delete(key);
  }
}

module.exports = {
  checkAutoKick,
  getAutoKickThreshold,
  buildAutoKickInfractionFilter,
  shouldCheckAutoKickImmediately,
  hasReachedAutoKickThreshold,
  isAutoKickEligible,
};

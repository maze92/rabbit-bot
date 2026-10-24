// src/systems/automation.js
// Regras de automação adicionais (auto-mute baseado em trust / warns)

const { PermissionsBitField } = require("discord.js");
const config = require("../config/defaultConfig");
const {
  getGuildTrustConfig,
  getEffectiveMaxWarnings,
  getEffectiveMuteDuration,
} = require("../utils/trust");
const infractionsService = require("./infractionsService");
const warningsService = require("./warningsService");
const logger = require("./logger");
const { fetchMember } = require("../services/discordFetchCache");
const { tContext } = require("./i18n");

function resolveAutoMuteThreshold(maxWarnings, trustCfg, trustValue) {
  const base = Number(maxWarnings);
  if (!Number.isFinite(base) || base <= 0) return null;
  return getEffectiveMaxWarnings(base, trustCfg, trustValue);
}

/**
 * Lida com automação após criação de uma infração (por exemplo, WARN).
 * Atualmente só trata de auto-mute escalonado; não faz kicks/bans.
 *
 * @param {Object} opts
 * @param {impor'discord.js'.Client} opts.client
 * @param {impor'discord.js'.Guild}  opts.guild
 * @param {impor'discord.js'.User}   opts.user
 * @param {impor'discord.js'.User}   opts.moderator
 * @param {'WARN'|'MUTE'}               opts.type
 */
async function handleInfractionAutomation(opts) {
  try {
    const { client, guild, user, moderator, type } = opts || {};
    if (!client || !guild || !user) return;

    const autoMuteCfg = config.automation && config.automation.autoMute;
    if (!autoMuteCfg || autoMuteCfg.enabled === false) return;

    // Só reagimos a WARN/MUTE (normalmente WARN)
    if (type !== "WARN" && type !== "MUTE") return;

    const me = guild.members.me;
    if (!me) return;
    if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

    // Ler estado do utilizador (trust + nº de warns) a partir do warningsService
    let warnsCount = 0;
    let trustUser = null;

    try {
      trustUser = await warningsService.getOrCreateUser(guild.id, user.id);
      if (trustUser && typeof trustUser.warnings === "number") {
        warnsCount = trustUser.warnings;
      }
    } catch (err) {
      console.warn(
        "[automation] failed to load user warnings/trust:",
        err?.message || err,
      );
      return;
    }

    const trustCfg = await getGuildTrustConfig(guild.id);
    const trustValue =
      trustUser && typeof trustUser.trust === "number"
        ? trustUser.trust
        : typeof trustCfg.base === "number"
          ? trustCfg.base
          : 0;
    const threshold = resolveAutoMuteThreshold(
      config.maxWarnings,
      trustCfg,
      trustValue,
    );
    if (threshold === null || warnsCount < threshold) return null;

    // Base de duração configurada
    const baseDurationMs =
      typeof autoMuteCfg.muteDurationMs === "number"
        ? autoMuteCfg.muteDurationMs
        : 10 * 60 * 1000; // 10 minutos por omissão

    // Duração efetiva calculada com o mesmo helper usado na dashboard (getEffectiveMuteDuration)
    const durationMs = getEffectiveMuteDuration(
      baseDurationMs,
      trustCfg,
      trustValue,
    );

    const member = await fetchMember(guild, user.id);
    if (!member) return;

    // Se já estiver em timeout, não fazemos nada
    if (member.isCommunicationDisabled && member.isCommunicationDisabled()) {
      return;
    }

    try {
      await member.timeout(durationMs, "Auto-mute (automation)");
    } catch (err) {
      console.warn("[automation] timeout threw:", err?.message || err);
      return null;
    }

    // Aplicar penalização de trust associada ao mute
    try {
      await warningsService.applyMutePenalty(guild.id, user.id);
    } catch (err) {
      console.warn(
        "[automation] failed to apply mute penalty:",
        err?.message || err,
      );
    }

    // Criar infração MUTE dedicada (para aparecer em logs / dashboard)
    let inf = null;
    try {
      inf = await infractionsService.create({
        guild,
        user,
        moderator: moderator || client.user,
        type: "MUTE",
        reason: "Auto-mute (automation)",
        duration: durationMs,
        source: "automation",
      });
    } catch (err) {
      console.warn(
        "[automation] failed to create MUTE infraction:",
        err?.message || err,
      );
    }

    const mins = Math.max(1, Math.round(durationMs / 60000));
    const casePrefix = inf?.caseId ? `Case: **#${inf.caseId}**\n` : "";

    try {
      await logger(
        client,
        "Automation: Auto-Mute",
        user,
        moderator || client.user,
        casePrefix +
          (await tContext(guild, "log.actions.automodMute", {
            minutes: mins,
            trustAfter: "N/A",
          })),
        guild,
      ).catch(() => null);
    } catch {
      // ignore logger errors
    }
    return { muted: true, durationMs, threshold };
  } catch (err) {
    console.error("[automation] handleInfractionAutomation error:", err);
    return null;
  }
}

module.exports = {
  handleInfractionAutomation,
  resolveAutoMuteThreshold,
};

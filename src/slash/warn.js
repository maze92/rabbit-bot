// src/slash/warn.js

const config = require("../config/defaultConfig");
const logger = require("../systems/logger");
const warningsService = require("../systems/warningsService");
const infractionsService = require("../systems/infractionsService");
const { handleInfractionAutomation } = require("../systems/automation");
const { checkAutoKick } = require("../systems/autoKick");
const { tContext } = require("../systems/i18n");
const { isStaff } = require("./utils");
const { replyEphemeral, safeReply } = require("../utils/discord");
const { ensureWarnPermissions } = require("../utils/modPermissions");
const {
  getGuildTrustConfig,
  getEffectiveMaxWarnings,
} = require("../utils/trust");

module.exports = async function warnSlash(client, interaction) {
  try {
    const guild = interaction.guild;
    if (!guild) return;

    const executor = interaction.member;
    const botMember = guild.members.me;

    if (!executor || !botMember) {
      return replyEphemeral(
        interaction,
        await tContext(interaction, "common.unexpectedError"),
      );
    }

    const staff = await isStaff(executor, "moderation").catch(() => false);
    if (!staff) {
      return replyEphemeral(
        interaction,
        await tContext(interaction, "common.noPermission"),
      );
    }

    const targetUser = interaction.options.getUser("user", true);
    const target = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return replyEphemeral(
        interaction,
        await tContext(interaction, "common.cannotResolveUser"),
      );
    }

    const canProceed = await ensureWarnPermissions({
      client,
      interaction,
      executor,
      target,
      botMember,
    });
    if (!canProceed) return;

    const rawReason = (interaction.options.getString("reason") || "").trim();
    const reason =
      rawReason || (await tContext(interaction, "common.noReason"));

    // Add warning and update trust/user state
    const dbUser = await warningsService.addWarning(guild.id, target.id, 1);

    const baseMaxWarnings =
      typeof config.maxWarnings === "number" ? config.maxWarnings : 3;

    const trustCfg = await getGuildTrustConfig(guild.id);
    const trustValue = Number.isFinite(dbUser?.trust)
      ? dbUser.trust
      : typeof trustCfg.base === "number"
        ? trustCfg.base
        : 0;

    const effectiveMaxWarnings = getEffectiveMaxWarnings(
      baseMaxWarnings,
      trustCfg,
      trustValue,
    );

    // Create WARN infraction
    let warnInf = null;
    try {
      warnInf = await infractionsService.create({
        guild,
        user: target.user,
        moderator: interaction.user,
        type: "WARN",
        reason,
        duration: null,
        source: "slash",
      });
    } catch {
      // ignore
    }

    // O serviço central gere o único auto-mute associado ao WARN.
    let autoMuteResult = null;
    try {
      autoMuteResult = await handleInfractionAutomation({
        client,
        guild,
        user: target.user,
        moderator: interaction.user,
        type: "WARN",
      });
    } catch {
      // ignore
    }

    const casePrefix = warnInf?.caseId ? `Case: **#${warnInf.caseId}**\n` : "";

    // Resposta pública no canal
    await interaction
      .reply({
        content:
          casePrefix +
          (await tContext(interaction, "warn.channelConfirm", {
            userMention: `${target}`,
            warnings: dbUser.warnings,
            maxWarnings: effectiveMaxWarnings,
            reason,
          })),
      })
      .catch(() => null);

    if (autoMuteResult?.muted) {
      const mins = Math.max(
        1,
        Math.round(autoMuteResult.durationMs / 60000),
      );
      await interaction
        .followUp({
          content: await tContext(interaction, "automod.mutePublic", {
            userMention: `${target}`,
            minutes: mins,
          }),
        })
        .catch(() => null);
    }

    // Log do WARN manual
    try {
      await logger(
        client,
        "Slash Warn",
        target.user,
        interaction.user,
        await tContext(interaction, "log.actions.manualWarn", {
          reason,
          warnings: dbUser.warnings,
          maxWarnings: effectiveMaxWarnings,
          trust: dbUser.trust ?? "N/A",
        }),
        guild,
      );
    } catch {
      // ignore
    }
    await checkAutoKick(client, guild.id, target.id);
  } catch (err) {
    console.error("[slash/warn] Error:", err);
    return safeReply(
      interaction,
      { content: await tContext(interaction, "common.unexpectedError") },
      { ephemeral: true },
    );
  }
};

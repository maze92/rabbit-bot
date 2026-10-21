// src/slash/clear.js

const { PermissionsBitField } = require("discord.js");

const logger = require("../systems/logger");
const { tContext } = require("../systems/i18n");
const { isStaff } = require("./utils");
const { replyEphemeral, safeReply } = require("../utils/discord");

module.exports = async function clearSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;

    const guild = interaction.guild;
    const executor = interaction.member;
    const botMember = guild.members.me;
    if (!executor || !botMember) {
      return replyEphemeral(
        interaction,
        await tContext(interaction, "common.unexpectedError"),
      );
    }

    if (!(await isStaff(executor, "moderation"))) {
      return replyEphemeral(
        interaction,
        await tContext(interaction, "common.noPermission"),
      );
    }

    const perms = interaction.channel?.permissionsFor?.(botMember);
    if (!perms?.has(PermissionsBitField.Flags.ManageMessages)) {
      return replyEphemeral(
        interaction,
        await tContext(interaction, "clear.noPerm"),
      );
    }

    const amount = interaction.options.getInteger("amount", true);
    const toDelete = Math.min(100, amount);

    let deleted = null;
    try {
      deleted = await interaction.channel.bulkDelete(toDelete, true);
    } catch (err) {
      console.error("[slash/clear] bulkDelete error:", err);
      deleted = null;
    }

    if (!deleted) {
      return replyEphemeral(
        interaction,
        await tContext(interaction, "clear.tooOldOrNoPerm"),
      );
    }

    const deletedCount = deleted.size || 0;

    await replyEphemeral(
      interaction,
      await tContext(interaction, "clear.success", { count: deletedCount }),
    );

    await logger(
      client,
      "Slash Clear Messages",
      null,
      interaction.user,
      await tContext(interaction, "log.actions.clear", {
        count: deletedCount,
        channelId: interaction.channel.id,
      }),
      guild,
    );
  } catch (err) {
    console.error("[slash/clear] Error:", err);
    return safeReply(
      interaction,
      { content: await tContext(interaction, "common.unexpectedError") },
      { ephemeral: true },
    );
  }
};

const { EmbedBuilder } = require("discord.js");
const { isStaff } = require("../utils/staff");
const { safeReply } = require("../utils/discord");
const { tContext } = require("../systems/i18n");

const COMMAND_GROUPS = [
  {
    nameKey: "info.groups.moderation",
    commands: [
      ["/warn", "info.commands.warn"],
      ["/mute", "info.commands.mute"],
      ["/unmute", "info.commands.unmute"],
      ["/kick", "info.commands.kick"],
      ["/ban", "info.commands.ban"],
      ["/unban", "info.commands.unban"],
      ["/clear", "info.commands.clear"],
      ["/history", "info.commands.history"],
      ["/userinfo", "info.commands.userinfo"],
    ],
  },
  {
    nameKey: "info.groups.community",
    commands: [
      ["/poll", "info.commands.poll"],
      ["/rank", "info.commands.rank"],
      ["/leaderboard", "info.commands.leaderboard"],
      ["/help", "info.commands.help"],
      ["/info", "info.commands.info"],
    ],
  },
  {
    nameKey: "info.groups.music",
    commands: [
      ["/play", "info.commands.play"],
      ["/stop", "info.commands.stop"],
      ["/queue", "info.commands.queue"],
      ["/nowplaying", "info.commands.nowplaying"],
    ],
  },
];

module.exports = async function infoSlash(_client, interaction) {
  try {
    if (!interaction.guild || !(await isStaff(interaction.member))) {
      return safeReply(
        interaction,
        { content: await tContext(interaction, "common.noPermission") },
        { ephemeral: true },
      );
    }

    const groups = await Promise.all(
      COMMAND_GROUPS.map(async (group) => ({
        name: await tContext(interaction, group.nameKey),
        value: (
          await Promise.all(
            group.commands.map(async ([command, descriptionKey]) => {
              const description = await tContext(interaction, descriptionKey);
              return `**${command}** · ${description}`;
            }),
          )
        ).join("\n"),
      })),
    );

    const embed = new EmbedBuilder()
      .setColor(0x2f855a)
      .setTitle(await tContext(interaction, "info.title"))
      .setDescription(await tContext(interaction, "info.description"))
      .addFields(groups)
      .setFooter({
        text: await tContext(interaction, "info.serverFooter", {
          guildName: interaction.guild.name,
        }),
      });

    return safeReply(interaction, { embeds: [embed] }, { ephemeral: true });
  } catch (err) {
    console.error("[slash/info] Error:", err);
    return safeReply(
      interaction,
      { content: await tContext(interaction, "common.unexpectedError") },
      { ephemeral: true },
    );
  }
};

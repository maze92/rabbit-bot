const { safeReply } = require("../utils/discord");
const { playGuildMusic } = require("../systems/music");
const { tContext } = require("../systems/i18n");

module.exports = async function playSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;

    const memberVoice = interaction.member?.voice;
    if (!memberVoice?.channel) {
      return safeReply(
        interaction,
        { content: await tContext(interaction, "play.voiceRequired") },
        { ephemeral: true },
      );
    }

    const query = interaction.options.getString("query", true);
    const result = await playGuildMusic({
      client,
      guildId: interaction.guild.id,
      channelId: memberVoice.channel.id,
      query,
    });

    if (!result.ok) {
      const reasonKey =
        result.reason === "EMPTY_QUERY"
          ? "play.emptyQuery"
          : result.reason === "NO_RESULTS"
            ? "play.noResults"
            : result.reason === "SOURCE_BLOCKED"
              ? "play.sourceBlocked"
              : result.reason === "STREAM_NOT_AUDIO"
                ? "play.notAudio"
                : "play.failed";

      return safeReply(
        interaction,
        { content: await tContext(interaction, reasonKey) },
        { ephemeral: true },
      );
    }

    return interaction.reply({
      content: await tContext(interaction, "play.nowPlaying", {
        title: result.title,
        channel: memberVoice.channel.name,
      }),
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[slash/play] Error:", err);
    return safeReply(
      interaction,
      { content: await tContext(interaction, "play.failed") },
      { ephemeral: true },
    );
  }
};

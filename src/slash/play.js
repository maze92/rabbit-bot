const { safeReply } = require("../utils/discord");
const { playGuildMusic } = require("../systems/music");

module.exports = async function playSlash(client, interaction) {
  try {
    if (!interaction?.guild) return;

    const memberVoice = interaction.member?.voice;
    if (!memberVoice?.channel) {
      return safeReply(
        interaction,
        { content: "Você precisa entrar num canal de voz antes de usar /play." },
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
      return safeReply(
        interaction,
        {
          content:
            result.reason === "EMPTY_QUERY"
              ? "Precisas indicar uma música, link ou pesquisa."
              : result.reason === "NO_RESULTS"
                ? "Não encontrei resultados para essa pesquisa."
                : result.reason === "SOURCE_BLOCKED"
                  ? "A fonte bloqueou o acesso automatizado. Usa um link direto para um stream de áudio acessível."
                  : result.reason === "STREAM_NOT_AUDIO"
                    ? "O link não devolveu áudio. Usa um link direto para um stream de áudio."
                : "Não consegui reproduzir esse áudio no momento.",
        },
        { ephemeral: true },
      );
    }

    return interaction.reply({
      content: `🎵 A reproduzir "${result.title}" no canal ${memberVoice.channel.name}.`,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[slash/play] Error:", err);
    return safeReply(
      interaction,
      { content: "Ocorreu um erro ao iniciar a reprodução." },
      { ephemeral: true },
    );
  }
};

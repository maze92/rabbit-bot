const { EmbedBuilder } = require("discord.js");
const { isStaff } = require("../utils/staff");
const { safeReply } = require("../utils/discord");
const { tContext } = require("../systems/i18n");

const COMMAND_GROUPS = [
  {
    name: "Moderação",
    commands: [
      ["/warn", "Regista um aviso para um membro."],
      ["/mute", "Aplica mute temporário ou permanente."],
      ["/unmute", "Remove o mute de um membro."],
      ["/kick", "Expulsa um membro do servidor."],
      ["/ban", "Bane um membro, com duração opcional."],
      ["/unban", "Remove um utilizador da lista de banidos."],
      ["/clear", "Apaga mensagens recentes num canal."],
      ["/history", "Consulta o histórico de moderação de um membro."],
      ["/userinfo", "Mostra informação e estado de um membro."],
    ],
  },
  {
    name: "Comunidade",
    commands: [
      ["/poll", "Cria uma votação interativa."],
      ["/rank", "Mostra o nível e XP de um membro."],
      ["/leaderboard", "Mostra a tabela de XP do servidor."],
      ["/help", "Apresenta ajuda resumida para membros."],
      ["/info", "Abre este guia completo para a staff."],
    ],
  },
  {
    name: "Música",
    commands: [
      ["/play", "Pesquisa ou reproduz um link de áudio no canal de voz."],
      ["/stop", "Para a reprodução e limpa a fila."],
      ["/queue", "Mostra as faixas em espera."],
      ["/nowplaying", "Mostra a faixa em reprodução."],
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

    const embed = new EmbedBuilder()
      .setColor(0x2f855a)
      .setTitle(".rabbit | Guia da staff")
      .setDescription(
        "Referência rápida dos comandos disponíveis neste servidor.",
      )
      .addFields(
        COMMAND_GROUPS.map((group) => ({
          name: group.name,
          value: group.commands
            .map(([command, description]) => `**${command}** · ${description}`)
            .join("\n"),
        })),
      )
      .setFooter({ text: `Servidor: ${interaction.guild.name}` });

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
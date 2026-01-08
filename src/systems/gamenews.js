const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");
const GameNews = require("../database/models/GameNews");
const logger = require("./logger");

const parser = new Parser();

/**
 * Verifica se a notícia é nova
 * @param {string} source - Nome do feed
 * @param {string} link - Link da notícia
 * @returns {boolean} true se for nova
 */
async function isNewNews(source, link) {
  // Verificar no banco de dados se o link da última notícia já foi registrado
  const record = await GameNews.findOne({ source });

  if (!record) {
    // Se não houver registro, cria um novo com o link atual
    await GameNews.create({ source, lastLink: link });
    return true;
  }

  // Se a última notícia armazenada for o mesmo link, retorna false (não é nova)
  if (record.lastLink === link) return false;

  // Se for uma notícia nova, atualiza o link e salva no banco
  record.lastLink = link;
  await record.save();
  return true;
}

/**
 * Sistema de notícias automáticas
 * @param {Client} client - Discord.js client
 * @param {Object} config - Configurações do defaultConfig.js
 */
module.exports = async (client, config) => {
  if (!config.gameNews?.enabled) return;

  // Rodar a cada intervalo definido
  setInterval(async () => {
    for (const feed of config.gameNews.sources) {
      try {
        // Parse o feed RSS
        const parsedFeed = await parser.parseURL(feed.feed);
        if (!parsedFeed.items.length) continue; // Se o feed não tiver itens, continuar com o próximo

        const latestNews = parsedFeed.items[0];  // Pega a última notícia
        if (!latestNews || !latestNews.link) continue; // Se não tiver link, pula

        // Verificar se é uma notícia nova
        const isNew = await isNewNews(feed.name, latestNews.link);
        if (!isNew) continue; // Se não for nova, pula

        // Pega o canal do Discord para enviar a notícia
        const channel = await client.channels.fetch(feed.channelId);
        if (!channel) {
          console.warn(`Canal não encontrado para o feed ${feed.name}`);
          continue;
        }

        // Criar embed da notícia
        const embed = new EmbedBuilder()
          .setTitle(latestNews.title)
          .setURL(latestNews.link)
          .setDescription(latestNews.contentSnippet || "No description available")
          .setColor(0xe60012)
          .setFooter({ text: feed.name }) // Usando o nome do feed para identificar de onde veio a notícia
          .setTimestamp(new Date(latestNews.pubDate));

        if (latestNews.enclosure?.url) {
          embed.setThumbnail(latestNews.enclosure.url); // Se a notícia tem imagem, adicionar no embed
        }

        // Enviar embed para o Discord
        await channel.send({ embeds: [embed] });

        // Log para o servidor
        if (channel.guild) {
          logger(channel.guild, "Game News", `New: **${latestNews.title}**`);
        }

      } catch (err) {
        console.error(`[GameNews] Erro ao processar o feed ${feed.name}:`, err.message);
      }
    }
  }, config.gameNews.interval); // Intervalo de checagem, em milissegundos
};

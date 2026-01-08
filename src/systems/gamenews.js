const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");
const GameNews = require("../database/models/GameNews");
const logger = require("./logger");

const parser = new Parser();

/**
 * Função que normaliza a URL, removendo parâmetros extras
 * @param {string} url - URL do feed
 * @returns {string} URL normalizada
 */
function normalizeUrl(url) {
  // Remove parâmetros de URL desnecessários
  const urlObj = new URL(url);
  urlObj.searchParams.sort();  // Ordena os parâmetros de consulta para garantir uma comparação consistente
  return urlObj.toString();
}

/**
 * Verifica se a notícia é nova
 * @param {string} source - Nome do feed (ex: "Polygon_PC")
 * @param {string} link - Link da notícia
 * @returns {boolean} true se for nova
 */
async function isNewNews(source, link) {
  const normalizedLink = normalizeUrl(link);  // Normaliza o link

  // Verificar se o feed já existe no banco
  const record = await GameNews.findOne({ source });

  if (!record) {
    // Se o feed não existe, cria um novo registro
    await GameNews.create({ source, lastLink: normalizedLink });
    return true;  // É uma notícia nova
  }

  // Se o link da última notícia for o mesmo, significa que é repetido
  if (record.lastLink === normalizedLink) {
    return false;  // Não é nova, pois já foi processada
  }

  // Caso contrário, é uma notícia nova, então atualiza o link
  record.lastLink = normalizedLink;
  await record.save();  // Atualiza o banco de dados
  return true;
}

/**
 * Sistema de notícias automáticas
 * @param {Client} client - Discord.js client
 * @param {Object} config - Configurações do defaultConfig.js
 */
module.exports = async (client, config) => {
  if (!config.gameNews?.enabled) return;  // Verifica se o sistema de notícias está habilitado

  // Rodar a cada intervalo definido
  setInterval(async () => {
    for (const feed of config.gameNews.sources) {
      try {
        // Parse o feed RSS
        const parsedFeed = await parser.parseURL(feed.feed);
        if (!parsedFeed.items.length) continue;  // Se não tiver itens no feed, pula

        const latestNews = parsedFeed.items[0];  // Pega a última notícia
        if (!latestNews || !latestNews.link) continue;  // Se não tiver link, pula

        // Verificar se a notícia é nova
        const isNew = await isNewNews(feed.name, latestNews.link);
        if (!isNew) continue;  // Se a notícia não for nova, pula

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
  }, config.gameNews.interval);  // Intervalo de checagem, em milissegundos
};

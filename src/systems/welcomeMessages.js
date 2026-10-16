// src/systems/welcomeMessages.js
//
// Construção das mensagens de boas-vindas e de saída de membros.
// Partilhado entre os eventos (guildMemberAdd / guildMemberRemove) e o
// endpoint de teste da dashboard, para garantir o mesmo resultado.

const { EmbedBuilder } = require('discord.js');

// Variáveis suportadas nos modelos: {user} {username} {tag} {server} {memberCount}
function applyTemplate(text, vars) {
  return String(text == null ? '' : text).replace(/\{(\w+)\}/g, (m, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
    return m;
  });
}

/**
 * Constrói o payload (content/embeds) para o canal.
 * @param {object} opts
 * @param {object} opts.config   Bloco welcome/goodbye de GuildConfig.features
 * @param {import('discord.js').Guild} opts.guild
 * @param {import('discord.js').User|null} opts.user  Null => amostra de teste
 */
function buildMemberMessage({ config, guild, user }) {
  const c = config || {};
  const isTest = !user;

  const vars = {
    user: isTest ? 'Membro de Teste' : `<@${user.id}>`,
    username: isTest ? 'Membro de Teste' : (user.username || ''),
    tag: isTest ? 'Membro de Teste' : (user.tag || user.username || ''),
    server: guild ? guild.name : 'Servidor',
    memberCount: String((guild && guild.memberCount) || 0)
  };

  const text = applyTemplate(c.message, vars).slice(0, 1800);

  if (c.embed === false) {
    return { content: text || null };
  }

  const embed = new EmbedBuilder();
  if (text) embed.setDescription(text);
  if (/^#[0-9a-fA-F]{6}$/.test(String(c.color || ''))) {
    embed.setColor(String(c.color));
  }
  if (c.bannerUrl) embed.setImage(c.bannerUrl);

  const thumb = (user && typeof user.displayAvatarURL === 'function')
    ? user.displayAvatarURL({ size: 256 })
    : (guild && typeof guild.iconURL === 'function' ? guild.iconURL({ size: 256 }) : null);
  if (thumb) embed.setThumbnail(thumb);

  return { embeds: [embed] };
}

module.exports = { buildMemberMessage, applyTemplate };

// src/systems/welcomeMessages.js
//
// Construção das mensagens de boas-vindas e de saída de membros.
// Partilhado entre os eventos (guildMemberAdd / guildMemberRemove) e o
// endpoint de teste da dashboard, para garantir o mesmo resultado.

const { EmbedBuilder } = require('discord.js');
const { t } = require('./i18n');

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
 * @param {'welcome'|'goodbye'} [opts.kind]  Ajusta o rodapé da embed
 */
function buildMemberMessage({ config, guild, user, kind }) {
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

  const icon = (guild && typeof guild.iconURL === 'function') ? guild.iconURL({ size: 128 }) : null;
  const thumb = (user && typeof user.displayAvatarURL === 'function')
    ? user.displayAvatarURL({ size: 256 })
    : icon;
  if (thumb) embed.setThumbnail(thumb);

  // Cabeçalho com o servidor e rodapé com a contagem de membros — o mesmo
  // padrão usado pelos bots de referência (MEE6, Carl-bot).
  if (guild) {
    embed.setAuthor(icon ? { name: guild.name, iconURL: icon } : { name: guild.name });
  }

  embed.setTitle(t(kind === 'goodbye' ? 'member.goodbyeTitle' : 'member.welcomeTitle', null, {}));

  const count = Number((guild && guild.memberCount) || 0);
  if (count > 0) {
    embed.setFooter({
      text: kind === 'goodbye'
        ? t('member.nowMembers', null, count)
        : t('member.memberCount', null, count)
    });
  }

  embed.setTimestamp(new Date());

  return { embeds: [embed] };
}

module.exports = { buildMemberMessage, applyTemplate };

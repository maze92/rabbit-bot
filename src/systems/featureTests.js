// src/systems/featureTests.js
//
// Executa um "teste" de cada funcionalidade: envia uma amostra para o canal
// configurado para que o utilizador valide a configuração sem esperar por
// eventos reais de membros/mensagens.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildMemberMessage } = require('./welcomeMessages');

async function fetchSendable(client, channelId) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || typeof channel.send !== 'function') return null;
  return channel;
}

/**
 * @returns {Promise<{ok:boolean, error?:string, info?:string, data?:object}>}
 */
async function runFeatureTest({ client, guild, feature, config }) {
  const c = config || {};

  switch (feature) {
    case 'welcome':
    case 'goodbye': {
      const channel = await fetchSendable(client, c.channelId);
      if (!channel) return { ok: false, error: 'CHANNEL_REQUIRED' };
      await channel.send(buildMemberMessage({ config: c, guild, user: null }));
      return { ok: true };
    }

    case 'serverStats': {
      const { refreshGuild } = require('./serverStats');
      const r = await refreshGuild(client, guild, { force: true });
      if (!r || r.ok === false) return { ok: false, error: 'TEST_FAILED' };
      return { ok: true, data: { members: r.members, joins: r.joins, leaves: r.leaves } };
    }

    case 'messageLogs': {
      const channel = await fetchSendable(client, c.channelId);
      if (!channel) return { ok: false, error: 'CHANNEL_REQUIRED' };
      const embed = new EmbedBuilder()
        .setTitle('Teste — registo de mensagens')
        .setDescription('Esta é uma mensagem de teste do sistema de logs.')
        .setColor('#7c3aed');
      await channel.send({ embeds: [embed] });
      return { ok: true };
    }

    case 'reactionRoles': {
      const channel = await fetchSendable(client, c.channelId);
      if (!channel) return { ok: false, error: 'CHANNEL_REQUIRED' };
      const embed = new EmbedBuilder()
        .setTitle('Teste — cargos por reação')
        .setDescription('Reage a esta mensagem com os emojis configurados.');
      const message = await channel.send({ embeds: [embed] });
      const entries = Array.isArray(c.entries) ? c.entries : [];
      for (const entry of entries) {
        if (!entry || !entry.emoji) continue;
        await message.react(entry.emoji).catch(() => null);
      }
      return { ok: true };
    }

    case 'levels': {
      const channel = await fetchSendable(client, c.announceChannelId);
      if (!channel) return { ok: false, error: 'CHANNEL_REQUIRED' };
      await channel.send({ content: '🎉 Teste — um membro subiu para o nível 2!' });
      return { ok: true };
    }

    case 'starboard': {
      const channel = await fetchSendable(client, c.channelId);
      if (!channel) return { ok: false, error: 'CHANNEL_REQUIRED' };
      const embed = new EmbedBuilder()
        .setDescription('⭐ (teste) — entrada de starboard de exemplo')
        .setColor('#fbbf24');
      await channel.send({ embeds: [embed] });
      return { ok: true };
    }

    case 'verification': {
      const channel = await fetchSendable(client, c.channelId);
      if (!channel || !c.roleId) return { ok: false, error: 'CHANNEL_ROLE_REQUIRED' };
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify:test')
          .setLabel('Teste')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );
      const embed = new EmbedBuilder()
        .setTitle('Teste — verificação')
        .setDescription('Botão de exemplo (inativo durante o teste).');
      await channel.send({ embeds: [embed], components: [row] });
      return { ok: true };
    }

    case 'autoKick':
      // Sem efeitos colaterais: o teste devolve a configuração efetiva.
      return { ok: true, info: 'autoKick', data: { infractionsToKick: c.infractionsToKick } };

    case 'polls':
      // As enquetes são criadas por slash command no servidor.
      return { ok: true, info: 'polls' };

    default:
      return { ok: false, error: 'TEST_NOT_AVAILABLE' };
  }
}

module.exports = { runFeatureTest };

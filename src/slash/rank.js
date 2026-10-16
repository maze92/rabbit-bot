// src/slash/rank.js

const { EmbedBuilder } = require('discord.js');
const { t } = require('../systems/i18n');
const { getFeature } = require('../systems/featuresService');
const { getRank } = require('../systems/levels');
const { safeReply } = require('../utils/discord');

module.exports = async function rankSlash(_client, interaction) {
  try {
    if (!interaction?.guild) return;

    const cfg = await getFeature(interaction.guild.id, 'levels');
    if (cfg?.enabled !== true) {
      return safeReply(interaction, { content: t('levels.disabled') }, { ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const data = await getRank(interaction.guild.id, targetUser.id);
    if (!data || data.rank == null) {
      return safeReply(interaction, { content: t('rank.notFound') }, { ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(t('rank.title', null, { tag: targetUser.tag || targetUser.username }))
      .setColor('Green')
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'Nível', value: String(data.level), inline: true },
        { name: 'XP', value: String(data.xp), inline: true },
        { name: 'Mensagens', value: String(data.messages), inline: true },
        { name: 'Posição', value: `#${data.rank}`, inline: true }
      )
      .setTimestamp(new Date());

    return interaction.reply({ embeds: [embed] }).catch(() => null);
  } catch (err) {
    console.error('[slash/rank] Error:', err);
    return safeReply(interaction, { content: t('common.unexpectedError') }, { ephemeral: true });
  }
};

// src/events/guildCreate.js
//
// Onboarding básico multi-servidor: quando o bot entra num servidor novo
// garante que existe uma GuildConfig e publica uma mensagem curta a explicar
// os próximos passos. Não assume nada sobre servidores já existentes.

module.exports = (client) => {
  client.on('guildCreate', async (guild) => {
    try {
      if (!guild || !guild.id) return;

      console.log(`➕ Bot adicionado a: ${guild.name} (${guild.id})`);

      // 1) Configuração base por servidor (idempotente).
      try {
        const GuildConfig = require('../database/models/GuildConfig');
        await GuildConfig.updateOne(
          { guildId: guild.id },
          { $setOnInsert: { guildId: guild.id } },
          { upsert: true }
        );
      } catch (err) {
        console.warn('[guildCreate] Não foi possível criar a GuildConfig:', err?.message || err);
      }

      // 2) Mensagem de boas-vindas do bot no canal de sistema (ou no primeiro
      //    canal de texto onde consiga escrever).
      try {
        const { EmbedBuilder } = require('discord.js');

        const canSend = (ch) => {
          if (!ch || typeof ch.isTextBased !== 'function' || !ch.isTextBased()) return false;
          if (typeof ch.isDMBased === 'function' && ch.isDMBased()) return false;
          try {
            const perms = ch.permissionsFor(guild.members.me);
            return !perms || perms.has('SendMessages');
          } catch {
            return true;
          }
        };

        const target = canSend(guild.systemChannel)
          ? guild.systemChannel
          : guild.channels.cache.find(canSend);

        if (target) {
          const embed = new EmbedBuilder()
            .setTitle('Obrigado por me adicionares!')
            .setDescription(
              'Configura-me no painel web:\n\n' +
                '• Boas-vindas e saídas de membros\n' +
                '• Estatísticas do servidor no topo\n' +
                '• Moderação, tickets e funcionalidades extra'
            );

          const base = (process.env.PUBLIC_BASE_URL || '').trim();
          if (base) embed.setURL(base.replace(/\/+$/g, ''));

          await target.send({ embeds: [embed] }).catch(() => null);
        }
      } catch (err) {
        console.warn('[guildCreate] Não foi possível enviar a mensagem de onboarding:', err?.message || err);
      }
    } catch (err) {
      console.error('[guildCreate] Erro ao processar entrada no servidor:', err);
    }
  });
};

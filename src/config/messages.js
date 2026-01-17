// src/config/messages.js

module.exports = {
  en: {
    common: {
      noPermission: "❌ You don't have permission to use this command.",
      unexpectedError: '❌ An unexpected error occurred.',
      usage: (usage) => `❌ Usage: \`${usage}\``,
      noReason: 'No reason provided'
    },

    clear: {
      noPerm: '❌ I do not have permission to manage messages in this channel.',
      tooOldOrNoPerm:
        '⚠️ I could not delete messages. They may be too old (14+ days) or I lack permissions.',
      success: ({ count }) => `🧹 Cleared **${count}** messages.`,
      invalidAmount: ({ min, max }) => `❌ Amount must be between ${min} and ${max}.`
    },

    unmute: {
      notMuted: (tag) => `⚠️ **${tag}** is not muted.`,
      success: (tag) => `✅ **${tag}** has been unmuted.`,
      failed: '❌ Failed to unmute the user.'
    },

    help: {
      title: 'Ozark Bot – Help',

      moderationTitle: 'Moderation Commands',
      automodTitle: 'AutoMod & Anti-Spam',
      gameNewsTitle: 'Game News',
      dashboardTitle: 'Dashboard',

      moderation: (prefix) => [
        `• \`${prefix}warn @user [reason]\` – issue a warning to a user`,
        `• \`${prefix}mute @user [10m/1h/2d] [reason]\` – timeout (mute) a user`,
        `• \`${prefix}unmute @user\` – remove timeout from a user`,
        `• \`${prefix}clear <amount>\` – clear messages in the current channel`,
        `• \`${prefix}userinfo [@user]\` – show info about a user (warnings, trust, infractions count)`
      ],

      automod: [
        '• AutoMod: detects banned words, deletes the message, adds a WARN and can auto-mute on repeated infractions.',
        '• Anti-Spam: detects repeated/similar messages in a short interval and applies an automatic mute.',
        '• Trust Score: repeat offenders lose trust and are moderated with less tolerance (fewer warnings / longer mutes).'
      ],

      gameNews: [
        '• GameNews: fetches RSS feeds (GameSpot) and sends new articles to specific channels.',
        '• Feeds have automatic backoff and status visible in the dashboard.'
      ],

      dashboard: [
        '• Real-time moderation log + history (Mongo).',
        '• GameNews status panel + `/health` endpoint for monitoring.'
      ],

      footer: (prefix) =>
        `If you need more details about a command, use it like \`${prefix}command\` followed by the arguments shown above.`
    },

    log: {
      labels: {
        user: 'User',
        executor: 'Moderator'
      },
      trustRisk: {
        high: 'High risk',
        medium: 'Medium risk',
        low: 'Low risk'
      },
      noDescription: 'No description provided.',
      messages: {
        clearLog: ({ count, channelId }) =>
          `Cleared **${count}** messages in <#${channelId}> (channelId: \`${channelId}\`)`,
        userUnmuted: (tag) => `User **${tag}** unmuted manually.`
      }
    }
  },

  pt: {
    common: {
      noPermission: '❌ Não tens permissão para usar este comando.',
      unexpectedError: '❌ Ocorreu um erro inesperado.',
      usage: (usage) => `❌ Uso correto: \`${usage}\``,
      noReason: 'Sem motivo especificado'
    },

    clear: {
      noPerm: '❌ Não tenho permissão para gerir mensagens neste canal.',
      tooOldOrNoPerm:
        '⚠️ Não consegui apagar as mensagens. Podem ser antigas (14+ dias) ou posso não ter permissões.',
      success: ({ count }) => `🧹 Limpei **${count}** mensagens.`,
      invalidAmount: ({ min, max }) => `❌ A quantidade tem de estar entre ${min} e ${max}.`
    },

    unmute: {
      notMuted: (tag) => `⚠️ **${tag}** não está silenciado.`,
      success: (tag) => `✅ **${tag}** foi removido do silêncio.`,
      failed: '❌ Falha ao remover o silêncio.'
    },

    help: {
      title: 'Ozark Bot – Ajuda',

      moderationTitle: 'Comandos de Moderação',
      automodTitle: 'AutoMod & Anti-Spam',
      gameNewsTitle: 'Game News',
      dashboardTitle: 'Dashboard',

      moderation: (prefix) => [
        `• \`${prefix}warn @user [motivo]\` – aplicar um aviso a um utilizador`,
        `• \`${prefix}mute @user [10m/1h/2d] [motivo]\` – silenciar (timeout) um utilizador`,
        `• \`${prefix}unmute @user\` – remover silêncio de um utilizador`,
        `• \`${prefix}clear <quantidade>\` – apagar mensagens no canal atual`,
        `• \`${prefix}userinfo [@user]\` – mostrar info de um utilizador (avisos, trust, infrações)`
      ],

      automod: [
        '• AutoMod: deteta palavras proibidas, apaga a mensagem, adiciona um WARN e pode silenciar automaticamente em caso de reincidência.',
        '• Anti-Spam: deteta mensagens repetidas/semelhantes num curto intervalo e aplica um mute automático.',
        '• Trust Score: reincidentes perdem confiança e são moderados com menos tolerância (menos avisos / mute mais longo).'
      ],

      gameNews: [
        '• GameNews: obtém feeds RSS (GameSpot) e envia novos artigos para canais específicos.',
        '• Feeds têm backoff automático e estado visível no dashboard.'
      ],

      dashboard: [
        '• Log de moderação em tempo real + histórico (Mongo).',
        '• Painel de estado do GameNews + endpoint `/health` para monitorização.'
      ],

      footer: (prefix) =>
        `Para mais detalhes sobre um comando, usa \`${prefix}comando\` com os argumentos indicados acima.`
    },

    log: {
      labels: {
        user: 'Utilizador',
        executor: 'Moderador'
      },
      trustRisk: {
        high: 'Risco elevado',
        medium: 'Risco médio',
        low: 'Risco baixo'
      },
      noDescription: 'Sem descrição.',
      messages: {
        clearLog: ({ count, channelId }) =>
          `Foram apagadas **${count}** mensagens em <#${channelId}> (ID do canal: \`${channelId}\`).`,
        userUnmuted: (tag) => `Utilizador **${tag}** removido do silêncio manualmente.`
      }
    }
  }
};

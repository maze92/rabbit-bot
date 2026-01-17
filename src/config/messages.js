// src/config/messages.js

module.exports = {
  en: {
    common: {
      noPermission: "❌ You don't have permission to use this command.",
      usage: (text) => `❌ Usage: ${text}`,
      unexpectedError: '❌ An unexpected error occurred.',
      noReason: 'No reason provided'
    },

    clear: {
      noPerm: '❌ I do not have permission to manage messages in this channel.',
      tooOldOrNoPerm:
        '⚠️ I could not delete messages. They may be too old (14+ days) or I lack permissions.',
      success: ({ count }) => `🧹 Cleared **${count}** messages.`,
      invalidAmount: ({ min, max }) => `❌ Amount must be between ${min} and ${max}.`
    },

    warn: {
      cannotWarnSelf: '❌ You cannot warn yourself.',
      cannotWarnBot: '❌ You cannot warn the bot.',
      hierarchyBot: '❌ I cannot warn this user due to role hierarchy (my role is not high enough).',
      hierarchyYou: '❌ You cannot warn a user with an equal or higher role than yours.',
      cannotWarnAdmin: '❌ You cannot warn an Administrator.',
      warnedPublic: ({ mention, warnings, reason }) =>
        `⚠️ ${mention} has been warned.\n📌 Total warnings: **${warnings}**\n📝 Reason: **${reason}**`,
      warnedDM: ({ guildName, warnings, reason }) =>
        `⚠️ You received a **WARN** in **${guildName}**.\n📝 Reason: **${reason}**\n📌 Total warnings: **${warnings}**`
    },

    mute: {
      cannotMuteSelf: '❌ You cannot mute yourself.',
      cannotMuteBot: '❌ You cannot mute the bot.',
      cannotMuteBots: '⚠️ You cannot mute a bot.',
      alreadyMuted: (tag) => `⚠️ **${tag}** is already muted.`,
      missingPerm: '❌ I do not have permission to timeout members (Moderate Members).',
      hierarchyBot: '❌ I cannot mute this user (their role is higher or equal to my highest role).',
      hierarchyYou: '❌ You cannot mute a user with an equal or higher role than yours.',
      cannotMuteAdmin: '❌ You cannot mute an Administrator.',
      tooLong: '❌ Timeout duration cannot exceed 28 days.',
      mutedPublic: ({ tag, duration, reason }) =>
        `🔇 **${tag}** has been muted for **${duration}**.\n📝 Reason: **${reason}**`,
      mutedDM: ({ guildName, duration, reason }) =>
        `🔇 You received a **manual MUTE** in **${guildName}**.\n⏰ Duration: **${duration}**\n📝 Reason: **${reason}**`,
      failedMute: '❌ Failed to mute the user. Check my permissions and role hierarchy.'
    },

    userinfo: {
      title: (tag) => `User Info - ${tag}`,
      recentInfractionsStaffOnly: 'Recent infraction details are **visible to staff only**.',
      noRecentInfractions: 'No recent infractions found.',
      trustDisabled: 'Trust system is currently **disabled**.',
      trustInternal: 'Trust Score is **internal** and only visible to staff.\nModeration decisions may be stricter for repeat offenders.',
      fields: {
        user: '👤 User',
        account: '📅 Account',
        warnings: '⚠️ Warnings',
        trust: '🔐 Trust Score',
        recent: (n) => `🧾 Recent infractions (last ${n})`,
        summary: 'Summary by type'
      }
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
        `• \`${prefix}userinfo [@user]\` – show info about a user`
      ],
    
      automod: [
        '• AutoMod: detects banned words, deletes the message, adds a WARN and can auto-mute on repeated infractions.',
        '• Anti-Spam: detects repeated or similar messages in a short interval and applies an automatic mute.',
        '• Trust Score: repeat offenders lose trust and are moderated with less tolerance.'
      ],
    
      gameNews: [
        '• GameNews: fetches RSS feeds (GameSpot) and sends new articles to specific channels.',
        '• Feeds have automatic backoff and visible status in the dashboard.'
      ],
    
      dashboard: [
        '• Real-time moderation log and history (MongoDB).',
        '• GameNews status panel and `/health` endpoint for monitoring.'
      ],
    
      footer: (prefix) =>
        `For more details about a command, use \`${prefix}command\` followed by the arguments shown above.`
    },

    automod: {
      warnReason: (word) => `Inappropriate language (detected: "${word}")`,
      warnLogReason: (word) => `AutoMod detected banned word: ${word}`,
      warnChannel: ({ mention, warnings, maxWarnings }) =>
        `⚠️ ${mention}, you received a **WARN**.\n📝 Reason: **Inappropriate language**\n📌 Warnings: **${warnings}/${maxWarnings}**`,
      muteChannel: ({ mention, minutes }) =>
        `🔇 ${mention} has been **muted**.\n⏱️ Duration: **${minutes} minutes**\n📝 Reason: **Exceeded the warning limit**`,
      muteDM: ({ guildName, minutes }) =>
        `🔇 You have been **muted** in **${guildName}**.\n⏱️ Duration: **${minutes} minutes**\n📝 Reason: **Exceeded the warning limit**`
    }
  },

  pt: {
    common: {
      noPermission: '❌ Não tens permissão para usar este comando.',
      usage: (text) => `❌ Uso correto: ${text}`,
      unexpectedError: '❌ Ocorreu um erro inesperado.',
      noReason: 'Sem motivo indicado'
    },

    warn: {
      cannotWarnSelf: '❌ Não te podes avisar a ti próprio.',
      cannotWarnBot: '❌ Não podes avisar o bot.',
      hierarchyBot: '❌ Não consigo avisar este utilizador por causa da hierarquia de cargos (o meu cargo não é alto o suficiente).',
      hierarchyYou: '❌ Não podes avisar um utilizador com cargo igual ou superior ao teu.',
      cannotWarnAdmin: '❌ Não podes avisar um Administrador.',
      warnedPublic: ({ mention, warnings, reason }) =>
        `⚠️ ${mention} recebeu um aviso.\n📌 Total de avisos: **${warnings}**\n📝 Motivo: **${reason}**`,
      warnedDM: ({ guildName, warnings, reason }) =>
        `⚠️ Recebeste um **AVISO** em **${guildName}**.\n📝 Motivo: **${reason}**\n📌 Total de avisos: **${warnings}**`
    },

    mute: {
      cannotMuteSelf: '❌ Não te podes silenciar a ti próprio.',
      cannotMuteBot: '❌ Não podes silenciar o bot.',
      cannotMuteBots: '⚠️ Não podes silenciar um bot.',
      alreadyMuted: (tag) => `⚠️ **${tag}** já está silenciado.`,
      missingPerm: '❌ Não tenho permissão para aplicar timeout (Moderate Members).',
      hierarchyBot: '❌ Não consigo silenciar este utilizador (o cargo dele é igual ou superior ao meu cargo mais alto).',
      hierarchyYou: '❌ Não podes silenciar um utilizador com cargo igual ou superior ao teu.',
      cannotMuteAdmin: '❌ Não podes silenciar um Administrador.',
      tooLong: '❌ A duração do timeout não pode exceder 28 dias.',
      mutedPublic: ({ tag, duration, reason }) =>
        `🔇 **${tag}** foi silenciado por **${duration}**.\n📝 Motivo: **${reason}**`,
      mutedDM: ({ guildName, duration, reason }) =>
        `🔇 Recebeste um **SILENCIAMENTO** em **${guildName}**.\n⏰ Duração: **${duration}**\n📝 Motivo: **${reason}**`,
      failedMute: '❌ Falha ao silenciar. Verifica permissões e hierarquia de cargos.'
    },

    userinfo: {
      title: (tag) => `Informação do Utilizador - ${tag}`,
      recentInfractionsStaffOnly: 'Detalhes de infrações recentes são **visíveis apenas para staff**.',
      noRecentInfractions: 'Sem infrações recentes.',
      trustDisabled: 'O sistema de trust está **desativado**.',
      trustInternal: 'O Trust Score é **interno** e visível apenas para staff.\nAs decisões de moderação podem ser mais rígidas para reincidentes.',
      fields: {
        user: '👤 Utilizador',
        account: '📅 Conta',
        warnings: '⚠️ Avisos',
        trust: '🔐 Trust Score',
        recent: (n) => `🧾 Infrações recentes (últimas ${n})`,
        summary: 'Resumo por tipo'
      }
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
        `• \`${prefix}clear <quantidade>\` – apagar mensagens do canal atual`,
        `• \`${prefix}userinfo [@user]\` – mostrar informação de um utilizador`
      ],
    
      automod: [
        '• AutoMod: deteta palavras proibidas, apaga a mensagem, adiciona WARN e pode silenciar automaticamente.',
        '• Anti-Spam: deteta mensagens repetidas ou semelhantes num curto espaço de tempo.',
        '• Trust Score: reincidentes perdem trust e são moderados com menos tolerância.'
      ],
    
      gameNews: [
        '• GameNews: obtém feeds RSS (GameSpot) e envia novos artigos para canais específicos.',
        '• Feeds têm backoff automático e estado visível no dashboard.'
      ],
    
      dashboard: [
        '• Log de moderação em tempo real e histórico (MongoDB).',
        '• Painel de estado do GameNews e endpoint `/health` para monitorização.'
      ],
    
      footer: (prefix) =>
        `Para mais detalhes sobre um comando, utiliza \`${prefix}comando\` com os argumentos indicados acima.`
    },

    automod: {
      warnReason: (word) => `Linguagem inapropriada (detetado: "${word}")`,
      warnLogReason: (word) => `AutoMod detetou palavra proibida: ${word}`,
      warnChannel: ({ mention, warnings, maxWarnings }) =>
        `⚠️ ${mention}, recebeste um **AVISO**.\n📝 Motivo: **Linguagem inapropriada**\n📌 Avisos: **${warnings}/${maxWarnings}**`,
      muteChannel: ({ mention, minutes }) =>
        `🔇 ${mention} foi **silenciado**.\n⏱️ Duração: **${minutes} minutos**\n📝 Motivo: **Excedeu o limite de avisos**`,
      muteDM: ({ guildName, minutes }) =>
        `🔇 Foste **silenciado** em **${guildName}**.\n⏱️ Duração: **${minutes} minutos**\n📝 Motivo: **Excedeu o limite de avisos**`
    }
  }
};

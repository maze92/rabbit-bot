// src/config/messages.js

/**
 * Centralized messages for the whole bot.
 * - Anything user-facing should live here.
 * - Logs also use this so you never mix languages.
 */

module.exports = {
  en: {
    common: {
      noPermission: "❌ You don't have permission to use this command.",
      missingBotPerm: (permName) => `❌ I do not have permission: **${permName}**.`,
      usage: (usage) => `❌ Usage: \`${usage}\``,
      unexpectedError: '❌ An unexpected error occurred.',
      slowDown: ({ seconds }) => `⏳ Please slow down. Try again in **${seconds}s**.`,
      cannotResolveUser: '❌ I could not resolve that user.',
      noReason: 'No reason provided'
    },

    warn: {
      cannotWarnSelf: '❌ You cannot warn yourself.',
      cannotWarnBot: '❌ You cannot warn the bot.',
      roleHierarchyBot: '❌ I cannot warn this user due to role hierarchy (my role is not high enough).',
      roleHierarchyUser: '❌ You cannot warn a user with an equal or higher role than yours.',
      cannotWarnAdmin: '❌ You cannot warn an Administrator.',
      channelConfirm: ({ userMention, warnings, maxWarnings, reason }) =>
        `⚠️ ${userMention} has been warned.\n📌 Total warnings: **${warnings}/${maxWarnings}**\n📝 Reason: **${reason}**`,
      dmText: ({ guildName, warnings, maxWarnings, reason }) =>
        `⚠️ You received a **WARN** in **${guildName}**.\n📝 Reason: **${reason}**\n📌 Warnings: **${warnings}/${maxWarnings}**`
    },

    mute: {
      cannotMuteSelf: '❌ You cannot mute yourself.',
      cannotMuteBot: '❌ You cannot mute the bot.',
      cannotMuteBotUser: '⚠️ You cannot mute a bot.',
      alreadyMuted: ({ tag }) => `⚠️ **${tag}** is already muted.`,
      roleHierarchyBot: '❌ I cannot mute this user (their role is higher or equal to my highest role).',
      roleHierarchyUser: '❌ You cannot mute a user with an equal or higher role than yours.',
      cannotMuteAdmin: '❌ You cannot mute an Administrator.',
      maxDuration: '❌ Timeout duration cannot exceed 28 days.',
      channelConfirm: ({ tag, duration, reason }) =>
        `🔇 **${tag}** has been muted for **${duration}**.\n📝 Reason: **${reason}**`,
      dmText: ({ guildName, duration, reason }) =>
        `🔇 You received a **manual MUTE** in **${guildName}**.\n⏰ Duration: **${duration}**\n📝 Reason: **${reason}**`,
      failed: '❌ Failed to mute the user. Check my permissions and role hierarchy.'
    },

    unmute: {
      cannotUnmuteSelf: '❌ You cannot unmute yourself.',
      cannotUnmuteBot: '❌ You cannot unmute the bot.',
      roleHierarchyBot: '❌ I cannot unmute this user (their role is higher or equal to my highest role).',
      roleHierarchyUser: '❌ You cannot unmute a user with an equal or higher role than yours.',
      notMuted: ({ tag }) => `⚠️ **${tag}** is not muted.`,
      success: ({ tag }) => `✅ **${tag}** has been unmuted.`,
      failed: '❌ Failed to unmute the user. Check my permissions and role hierarchy.'
    },

    clear: {
      noPerm: '❌ I do not have permission to manage messages in this channel.',
      tooOldOrNoPerm:
        '⚠️ I could not delete messages. They may be too old (14+ days) or I lack permissions.',
      success: ({ count }) => `🧹 Cleared **${count}** messages.`
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
        `• \`${prefix}userinfo [@user]\` – show info about a user (staff sees trust/infractions)`
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
        `For more details about a command, use \`${prefix}command\` followed by the arguments shown above.`
    },

    automod: {
      warnReason: ({ word }) => `Inappropriate language (detected: "${word}")`,
      warnPublic: ({ userMention, warnings, maxWarnings, reason }) =>
        `⚠️ ${userMention}, you received a **WARN**.\n📝 Reason: **${reason}**\n📌 Warnings: **${warnings}/${maxWarnings}**`,
      muteReason: 'AutoMod: exceeded warning limit',
      mutePublic: ({ userMention, minutes }) =>
        `🔇 ${userMention} has been **muted**.\n⏱️ Duration: **${minutes} minutes**\n📝 Reason: **Exceeded the warning limit**`
    },

    antispam: {
      warnPublic: ({ userMention, warnings, maxWarnings }) =>
        `⚠️ ${userMention}, please stop spamming.
Warnings: **${warnings}/${maxWarnings}**`,
      warnReason: 'Spam / Flood detected (warning)',
      mutePublic: ({ userMention }) => `🔇 ${userMention} has been muted for spam.`,
      muteReason: 'Spam / Flood detected'
    },

    userinfo: {
      title: ({ tag }) => `User Info - ${tag}`,
      fieldUser: '👤 User',
      fieldAccount: '📅 Account',
      fieldWarnings: '⚠️ Warnings',
      fieldTrust: '🔐 Trust Score',
      fieldRecent: '🧾 Recent infractions (last 5)',
      tagAndId: ({ tag, id }) => `Tag: **${tag}**\nID: \`${id}\``,
      accountDates: ({ createdAt, joinedAt }) => `Created at: ${createdAt}\nJoined this server: ${joinedAt}`,
      warningsBlock: ({ warnings, maxWarnings, infractionsCount }) =>
        `**${warnings}** / **${maxWarnings}** (AutoMod base)\nInfractions registered: **${infractionsCount}**`,
      trustDisabled: 'Trust system is currently **disabled**.',
      trustStaff: ({ trustValue, trustMax, trustLabel }) =>
        `Trust: **${trustValue}/${trustMax}**\nRisk level: **${trustLabel}**`,
      trustPublic:
        'Trust Score is **internal** and only visible to staff.\nModeration decisions may be stricter for repeat offenders.',
      recentStaffOnly: 'Recent infraction details are **visible to staff only**.',
      noRecentInfractions: 'No recent infractions found.',
      requestedBy: ({ tag }) => `Requested by ${tag}`
    },

    commands: {
      couldNotVerifyRoles: '❌ Could not verify your roles.',
      unknownCommand: 'Unknown command.',
      execError: '⚠️ Error executing command.'
    },

    log: {
      labels: {
        user: 'User',
        executor: 'Moderator'
      },
      actions: {
        manualWarn: ({ reason, warnings, maxWarnings, trust }) =>
          `Reason: **${reason}**\nWarnings: **${warnings}/${maxWarnings}**\nTrust: **${trust}**`,
        manualMute: ({ duration, reason, trust }) =>
          `Duration: **${duration}**\nReason: **${reason}**\nTrust: **${trust}**`,
        manualUnmute: ({ warnings, trust }) =>
          `User unmuted manually.\nWarnings: **${warnings}**\nTrust: **${trust}**`,
        clear: ({ count, channelId }) =>
          `Cleared **${count}** messages in <#${channelId}> (channelId: \`${channelId}\`)`,
        automodWarn: ({ word, warnings, maxWarnings, trust, deleted }) =>
          `AutoMod detected banned word: **${word}**\nWarnings: **${warnings}/${maxWarnings}**\nTrust: **${trust}**\nDeleted: **${deleted}**`,
        automodMute: ({ minutes, trustAfter }) =>
          `AutoMod mute applied.\nDuration: **${minutes} minutes**\nTrust after mute: **${trustAfter}**`,
        antispamMute: ({ durationSeconds, threshold, intervalMs, similarityPct, trustAfter }) =>
          `User muted for spam.\nDuration: **${durationSeconds}s**\nThreshold: **${threshold} similar msgs / ${intervalMs}ms**\nSimilarity ≥ **${similarityPct}%**\nTrust after mute: **${trustAfter}**`,
        antispamWarn: ({ warnings, maxWarnings, threshold, intervalMs, similarityPct, trustAfter }) =>
          `User warned for spam.\nWarnings: **${warnings}/${maxWarnings}**\nThreshold: **${threshold} similar msgs / ${intervalMs}ms**\nSimilarity ≥ **${similarityPct}%**\nTrust after warn: **${trustAfter}**`,
        userinfo: ({ tag, id, warnings, maxWarnings, infractionsCount, trust, riskLabel }) =>
          `Requested info for: **${tag}** (\`${id}\`)\nWarnings: **${warnings}/${maxWarnings}**\nInfractions registered: **${infractionsCount}**\nTrust: **${trust}**\nRisk level: **${riskLabel}**`
      },
      trustRisk: {
        high: 'High risk',
        medium: 'Medium risk',
        low: 'Low risk'
      },
      noDescription: 'No description provided.'
    }
  },

  pt: {
    common: {
      noPermission: '❌ Não tens permissão para usar este comando.',
      missingBotPerm: (permName) => `❌ Não tenho a permissão necessária: **${permName}**.`,
      usage: (usage) => `❌ Uso correto: \`${usage}\``,
      unexpectedError: '❌ Ocorreu um erro inesperado.',
      slowDown: ({ seconds }) => `⏳ Vai com calma. Tenta novamente em **${seconds}s**.`,
      cannotResolveUser: '❌ Não consegui identificar esse utilizador.',
      noReason: 'Sem motivo especificado'
    },

    warn: {
      cannotWarnSelf: '❌ Não te podes avisar a ti próprio.',
      cannotWarnBot: '❌ Não podes avisar o bot.',
      roleHierarchyBot: '❌ Não consigo avisar este utilizador por hierarquia de cargos (o meu cargo não é suficientemente alto).',
      roleHierarchyUser: '❌ Não podes avisar um utilizador com cargo igual ou superior ao teu.',
      cannotWarnAdmin: '❌ Não podes avisar um Administrador.',
      channelConfirm: ({ userMention, warnings, maxWarnings, reason }) =>
        `⚠️ ${userMention} foi avisado.\n📌 Avisos: **${warnings}/${maxWarnings}**\n📝 Motivo: **${reason}**`,
      dmText: ({ guildName, warnings, maxWarnings, reason }) =>
        `⚠️ Recebeste um **WARN** em **${guildName}**.\n📝 Motivo: **${reason}**\n📌 Avisos: **${warnings}/${maxWarnings}**`
    },

    mute: {
      cannotMuteSelf: '❌ Não te podes silenciar a ti próprio.',
      cannotMuteBot: '❌ Não podes silenciar o bot.',
      cannotMuteBotUser: '⚠️ Não é possível silenciar um bot.',
      alreadyMuted: ({ tag }) => `⚠️ **${tag}** já está silenciado.`,
      roleHierarchyBot: '❌ Não consigo silenciar este utilizador (o cargo dele é igual ou superior ao meu).',
      roleHierarchyUser: '❌ Não podes silenciar um utilizador com cargo igual ou superior ao teu.',
      cannotMuteAdmin: '❌ Não podes silenciar um Administrador.',
      maxDuration: '❌ A duração do timeout não pode exceder 28 dias.',
      channelConfirm: ({ tag, duration, reason }) =>
        `🔇 **${tag}** foi silenciado por **${duration}**.\n📝 Motivo: **${reason}**`,
      dmText: ({ guildName, duration, reason }) =>
        `🔇 Recebeste um **MUTE manual** em **${guildName}**.\n⏰ Duração: **${duration}**\n📝 Motivo: **${reason}**`,
      failed: '❌ Falha ao silenciar o utilizador. Verifica permissões e hierarquia de cargos.'
    },

    unmute: {
      cannotUnmuteSelf: '❌ Não podes remover o teu próprio silêncio.',
      cannotUnmuteBot: '❌ Não podes remover o silêncio do bot.',
      roleHierarchyBot: '❌ Não consigo remover o silêncio (o cargo dele é igual ou superior ao meu).',
      roleHierarchyUser: '❌ Não podes remover o silêncio de um utilizador com cargo igual ou superior ao teu.',
      notMuted: ({ tag }) => `⚠️ **${tag}** não está silenciado.`,
      success: ({ tag }) => `✅ Removi o silêncio de **${tag}**.`,
      failed: '❌ Falha ao remover silêncio. Verifica permissões e hierarquia de cargos.'
    },

    clear: {
      noPerm: '❌ Não tenho permissão para gerir mensagens neste canal.',
      tooOldOrNoPerm:
        '⚠️ Não consegui apagar as mensagens. Podem ser antigas (14+ dias) ou posso não ter permissões.',
      success: ({ count }) => `🧹 Limpei **${count}** mensagens.`
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
        `• \`${prefix}userinfo [@user]\` – ver info de um utilizador (staff vê trust/infrações)`
      ],
      automod: [
        '• AutoMod: deteta palavras proibidas, apaga a mensagem, adiciona WARN e pode silenciar automaticamente em reincidência.',
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

    automod: {
      warnReason: ({ word }) => `Linguagem imprópria (detetado: "${word}")`,
      warnPublic: ({ userMention, warnings, maxWarnings, reason }) =>
        `⚠️ ${userMention}, recebeste um **WARN**.\n📝 Motivo: **${reason}**\n📌 Avisos: **${warnings}/${maxWarnings}**`,
      muteReason: 'AutoMod: limite de avisos atingido',
      mutePublic: ({ userMention, minutes }) =>
        `🔇 ${userMention} foi **silenciado**.\n⏱️ Duração: **${minutes} minutos**\n📝 Motivo: **Limite de avisos atingido**`
    },

    antispam: {
      warnPublic: ({ userMention, warnings, maxWarnings }) =>
        `⚠️ ${userMention}, pára de fazer spam.
Avisos: **${warnings}/${maxWarnings}**`,
      warnReason: 'Spam / Flood detetado (aviso)',
      mutePublic: ({ userMention }) => `🔇 ${userMention} foi silenciado por spam.`,
      muteReason: 'Spam / Flood detetado'
    },

    userinfo: {
      title: ({ tag }) => `Informação do Utilizador - ${tag}`,
      fieldUser: '👤 Utilizador',
      fieldAccount: '📅 Conta',
      fieldWarnings: '⚠️ Avisos',
      fieldTrust: '🔐 Trust',
      fieldRecent: '🧾 Infrações recentes (últimas 5)',
      tagAndId: ({ tag, id }) => `Tag: **${tag}**\nID: \`${id}\``,
      accountDates: ({ createdAt, joinedAt }) => `Criada em: ${createdAt}\nEntrou no servidor: ${joinedAt}`,
      warningsBlock: ({ warnings, maxWarnings, infractionsCount }) =>
        `**${warnings}** / **${maxWarnings}** (base do AutoMod)\nInfrações registadas: **${infractionsCount}**`,
      trustDisabled: 'O sistema de trust está **desativado**.',
      trustStaff: ({ trustValue, trustMax, trustLabel }) =>
        `Trust: **${trustValue}/${trustMax}**\nNível de risco: **${trustLabel}**`,
      trustPublic:
        'O Trust é **interno** e apenas visível para staff.\nA moderação pode ser mais restrita para reincidentes.',
      recentStaffOnly: 'Detalhes de infrações recentes são **apenas visíveis para staff**.',
      noRecentInfractions: 'Sem infrações recentes.',
      requestedBy: ({ tag }) => `Pedido por ${tag}`
    },

    commands: {
      couldNotVerifyRoles: '❌ Não foi possível verificar os teus cargos.',
      unknownCommand: 'Comando desconhecido.',
      execError: '⚠️ Erro ao executar o comando.'
    },

    log: {
      labels: {
        user: 'Utilizador',
        executor: 'Moderador'
      },
      actions: {
        manualWarn: ({ reason, warnings, maxWarnings, trust }) =>
          `Motivo: **${reason}**\nAvisos: **${warnings}/${maxWarnings}**\nTrust: **${trust}**`,
        manualMute: ({ duration, reason, trust }) =>
          `Duração: **${duration}**\nMotivo: **${reason}**\nTrust: **${trust}**`,
        manualUnmute: ({ warnings, trust }) =>
          `Silêncio removido manualmente.\nAvisos: **${warnings}**\nTrust: **${trust}**`,
        clear: ({ count, channelId }) =>
          `Foram apagadas **${count}** mensagens em <#${channelId}> (channelId: \`${channelId}\`)`,
        automodWarn: ({ word, warnings, maxWarnings, trust, deleted }) =>
          `AutoMod detetou palavra proibida: **${word}**\nAvisos: **${warnings}/${maxWarnings}**\nTrust: **${trust}**\nApagado: **${deleted}**`,
        automodMute: ({ minutes, trustAfter }) =>
          `AutoMod aplicou mute.\nDuração: **${minutes} minutos**\nTrust após mute: **${trustAfter}**`,
        antispamWarn: ({ warnings, maxWarnings, threshold, intervalMs, similarityPct, trustAfter }) =>
          `Utilizador avisado por spam.\nAvisos: **${warnings}/${maxWarnings}**\nLimite: **${threshold} mensagens semelhantes / ${intervalMs}ms**\nSimilaridade ≥ **${similarityPct}%**\nTrust após aviso: **${trustAfter}**`,
        antispamMute: ({ durationSeconds, threshold, intervalMs, similarityPct, trustAfter }) =>
          `Utilizador silenciado por spam.\nDuração: **${durationSeconds}s**\nLimite: **${threshold} mensagens semelhantes / ${intervalMs}ms**\nSimilaridade ≥ **${similarityPct}%**\nTrust após mute: **${trustAfter}**`,
        userinfo: ({ tag, id, warnings, maxWarnings, infractionsCount, trust, riskLabel }) =>
          `Pedido de info: **${tag}** (\`${id}\`)\nAvisos: **${warnings}/${maxWarnings}**\nInfrações registadas: **${infractionsCount}**\nTrust: **${trust}**\nNível de risco: **${riskLabel}**`
      },
      trustRisk: {
        high: 'Risco elevado',
        medium: 'Risco médio',
        low: 'Risco baixo'
      },
      noDescription: 'Sem descrição.'
    }
  }
};

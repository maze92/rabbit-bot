/**
 * Configuração principal do bot
 * Este ficheiro centraliza todas as opções configuráveis:
 * - prefixo
 * - moderação (AutoMod)
 * - logs
 * - cooldowns
 * - anti-spam / flood
 * - RSS GameNews
 * - dashboard
 */

module.exports = {
  // ==============================
  // Prefixo do bot
  // ==============================
  prefix: '!', // Prefixo usado nos comandos (ex: !warn)

  // ==============================
  // Configurações gerais
  // ==============================
  language: 'en',             // Idioma principal (futuro uso)
  logChannelName: 'log-bot',  // Canal onde os logs são enviados

  /**
   * Cargos autorizados (staff)
   * ✅ Recomendado: usar isto em TODOS os comandos
   * - Evita repetir IDs em cada comando
   * - Se mudares IDs, mudas aqui só uma vez
   */
  staffRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  // ==============================
  // Moderação automática (AutoMod)
  // ==============================
  maxWarnings: 3,                 // Warns máximos antes do timeout
  muteDuration: 10 * 60 * 1000,   // Duração do timeout automático (10 minutos)

  /**
   * Se true:
   * - Admins NÃO são moderados pelo AutoMod (bypass)
   * Se false:
   * - Admins também entram no AutoMod (apagar/warn/mute)
   *
   * NOTA:
   * Mesmo com bypass false, se o admin tiver role acima do bot, o Discord impede ações.
   */
  autoModBypassAdmins: true,

  /**
   * Palavras proibidas
   * - Separadas por idioma
   * - O sistema ignora maiúsculas/minúsculas
   * - Links e símbolos são removidos antes da verificação
   *
   * NOTA:
   * O AutoMod que combinámos suporta frases com espaços
   * (ex: "filho da puta") e leet básico.
   */
  bannedWords: {
    en: [
      'fuck','shit','bitch','asshole','dick','bastard','slut','whore',
      'fag','cunt','damn','piss','cock','motherfucker','nigger','retard',
      'douche','faggot','prick','whorebag','bollocks','bugger','twat',
      'arse','arsehole','bloody','crap','jerk','shithead','tosser'
    ],
    pt: [
      'merda','porra','caralho','bosta','cacete','foda','piranha','vadia',
      'otário','idiota','burro','imbecil','canalha','palhaço','babaca',
      'desgraçado','filho da puta','corno','viado','retardado','mané',
      'escroto','vagabundo','puta','lixo','nojento','desgraça'
    ]
  },

  // ==============================
  // Cooldowns de comandos (anti-spam de comandos)
  // ==============================
  cooldowns: {
    default: 3000,  // 3s para qualquer comando não listado
    warn: 5000,     // 5s
    mute: 5000,     // 5s
    unmute: 5000,   // 5s
    clear: 8000     // 8s (bulk delete é pesado)
  },

  // ==============================
  // Anti-Spam / Flood protection
  // ==============================
  antiSpam: {
    enabled: true,

    // Janela para contar mensagens (ms)
    interval: 7000,

    // Máximo de mensagens permitidas dentro da janela
    maxMessages: 6,

    // Timeout aplicado quando detetar spam (ms)
    muteDuration: 60 * 1000, // 1 minuto

    /**
     * Cooldown depois de agir num user (ms)
     * - Evita punir o mesmo user em loop
     * - Útil quando o user continua a spammar após o mute
     */
    actionCooldown: 60 * 1000, // 1 minuto

    // Se true, admins não são afetados
    bypassAdmins: true,

    /**
     * Roles que ignoram AntiSpam (opcional)
     * - Coloca IDs aqui se quiseres que certos cargos ignorem o sistema
     */
    bypassRoles: [
      // '1385619241235120174'
    ],

    /**
     * Se true, envia mensagem no canal quando aplica mute por spam
     * (Pode ser chato em canais muito ativos)
     */
    sendMessage: true
  },

  // ==============================
  // Dashboard
  // ==============================
  dashboard: {
    /**
     * Quantos logs manter em memória para mostrar no dashboard
     * (usado no src/dashboard.js)
     */
    maxLogs: 200
  },

  // ==============================
  // Sistema de Game News (RSS)
  // ==============================
  gameNews: {
    enabled: true,
    interval: 30 * 60 * 1000, // 30 minutos

    /**
     * Lista de feeds RSS
     * - name: nome interno (aparece nos logs)
     * - feed: URL do RSS
     * - channelId: canal onde as notícias vão ser enviadas
     */
    sources: [
      {
        name: 'GameSpot/Reviews',
        feed: 'https://www.gamespot.com/feeds/reviews',
        channelId: '1431959790174736446'
      },
      {
        name: 'GameSpot/News',
        feed: 'https://www.gamespot.com/feeds/game-news',
        channelId: '1458675935854465219'
      },
      {
        name: 'GameSpot/NewGames',
        feed: 'https://www.gamespot.com/feeds/new-games',
        channelId: '1460640560778838137'
      }
    ]
  }
};

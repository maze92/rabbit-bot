/**
 * src/config/defaultConfig.js
 * ============================================================
 * Configuração principal do bot
 * - prefixo
 * - roles de staff
 * - AutoMod
 * - AntiSpam
 * - Cooldowns
 * - Dashboard
 * - GameNews
 * ============================================================
 */

module.exports = {
  // ==============================
  // Prefixo do bot
  // ==============================
  prefix: '!',

  // ==============================
  // Configurações gerais
  // ==============================
  language: 'en',
  logChannelName: 'log-bot',

  /**
   * Roles de staff (IDs)
   * ✅ usado pelo systems/commands.js para controlar comandos staff-only
   */
  staffRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  // ==============================
  // AutoMod
  // ==============================
  maxWarnings: 3,
  muteDuration: 10 * 60 * 1000, // 10 min

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
  // Cooldowns de comandos
  // ==============================
  cooldowns: {
    default: 3000,
    warn: 5000,
    mute: 5000,
    unmute: 5000,
    clear: 8000
  },

  // ==============================
  // Anti-Spam / Flood protection
  // ==============================
  antiSpam: {
    enabled: true,
    interval: 7000,
    maxMessages: 6,
    muteDuration: 60 * 1000,
    actionCooldown: 60 * 1000,
    bypassAdmins: true,
    bypassRoles: [],
    sendMessage: true
  },

  // ==============================
  // Dashboard
  // ==============================
  dashboard: {
    enabled: true,
    maxLogs: 200,
    maxDbLogs: 1000,
    requireAuth: true
  },

  // ==============================
  // GameNews (RSS)
  // ==============================
  gameNews: {
    enabled: true,
    interval: 30 * 60 * 1000,
    hashHistorySize: 10,

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

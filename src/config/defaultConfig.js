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
    interval: 30 * 60 * 1000, // 30 min
  
    // ✅ dedupe real (quantos hashes manter por feed)
    keepHashes: 10,
  
    // ✅ não envia notícias muito antigas (dias)
    maxAgeDays: 7,
  
    // ✅ jitter global do ciclo (ms) — evita bater sempre “certinho”
    // exemplo: 20000 = +/- 20s
    jitterMs: 20000,
  
    // ✅ jitter pequeno entre feeds no mesmo ciclo (ms)
    perFeedJitterMs: 1500,
  
    // ✅ retry com jitter quando RSS falha (antes de contar como falha/backoff)
    retry: {
      attempts: 2,       // tenta 2 vezes no total
      baseDelayMs: 1200, // espera 1.2s (e depois 2.4s) antes da próxima tentativa
      jitterMs: 800      // +/- 0.8s de jitter no retry
    },
  
    // ✅ backoff por feed quando falha muitas vezes
    backoff: {
      maxFails: 3,
      pauseMs: 30 * 60 * 1000
    },
  
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

module.exports = {
  // ==============================
  // Prefixo do bot
  // ==============================
  prefix: '!',


  // ==============================
  // Moderação automática
  // ==============================
  maxWarnings: 3,                   // Warns antes de mute
  muteDuration: 10 * 60 * 1000,     // 10 minutos
  logChannelName: 'log-bot',        // Canal de logs
  language: 'en',

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
  // Anti-Spam (PASSO 2)
  // ==============================
  antiSpam: {
    enabled: true,
    maxMessages: 5,            // Mensagens permitidas
    interval: 7000,            // Em 7 segundos
    muteDuration: 5 * 60 * 1000 // 5 minutos
  },


  // ==============================
  // Cooldowns de comandos (PASSO 2)
  // ==============================
  cooldowns: {
    default: 3000,   // 3 segundos para qualquer comando
    clear: 10000,    // 10s
    purgeuser: 15000 // 15s
  },


  // ==============================
  // Notícias de jogos (Game News)
  // ==============================
  gameNews: {
    enabled: true,
    interval: 30 * 60 * 1000, // 30 minutos
    sources: [
      {
        name: "GameSpot/Reviews",
        feed: "https://www.gamespot.com/feeds/reviews",
        channelId: "1431959790174736446"
      },
      {
        name: "GameSpot/News",
        feed: "https://www.gamespot.com/feeds/game-news",
        channelId: "1458675935854465219"
      },
      {
        name: "GameSpot/NewGames",
        feed: "https://www.gamespot.com/feeds/new-games",
        channelId: "1449609850446286911"
      }
    ]
  }
};

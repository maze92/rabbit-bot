module.exports = {
  // ==============================
  // Prefixo do bot
  // ==============================
  prefix: '!', // Prefixo configurável

  // ==============================
  // Moderação automática
  // ==============================
  maxWarnings: 3,                   // Quantidade máxima de warns antes de mute
  muteDuration: 10 * 60 * 1000,     // 10 minutos em milissegundos
  logChannelName: 'log-bot',        // Canal de logs
  language: 'en',

  // Palavras proibidas
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
  // Notícias de jogos (Game News)
  // ==============================
  gameNews: {
    enabled: true,                  // Ativa ou desativa o sistema
    interval: 30 * 60 * 1000,       // Checagem a cada 30 minutos
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

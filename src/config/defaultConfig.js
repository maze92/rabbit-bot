module.exports = {
  // ==============================
  // Moderação
  // ==============================
  maxWarnings: 3,
  muteDuration: 10 * 60 * 1000, // 10 minutos
  logChannelName: 'log-bot',
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
  // Notícias de jogos (Game News)
  // ==============================
  gameNews: {
    enabled: true,                  // Ativa ou desativa o sistema
    interval: 1 * 60 * 1000,       // Intervalo de checagem em milissegundos (30 minutos)
    sources: [
      {
        name: "GameSpot/Reviews",                                      // Nome do feed
        feed: "https://www.gamespot.com/feeds/reviews",           // URL RSS
        channelId: "1431959790174736446"                             // Substituir pelo ID do canal do Discord
      },
      {
        name: "GameSpot/News",                                      // Nome do feed
        feed: "https://www.gamespot.com/feeds/game-news",           // URL RSS
        channelId: "1458675935854465219"                             // Substituir pelo ID do canal do Discord
      },
      {
        name: "GameSpot/NewGames",                                      // Nome do feed
        feed: "https://www.gamespot.com/feeds/new-games",           // URL RSS
        channelId: "1449609850446286911"                             // Substituir pelo ID do canal do Discord
      }
      // Podemos adicionar mais feeds aqui futuramente
    ]
  }
};

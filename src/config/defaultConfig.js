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
    interval: 30 * 60 * 1000,       // Intervalo de checagem em milissegundos (30 minutos)
    sources: [
      {
        feed: "https://www.polygon.com/feed/gaming/",      // URL do feed RSS da Polygon
        channelId: "1431959790174736446"                   // ID do canal do Discord para Polygon
      },
      {
        feed: "https://www.polygon.com/feed/guides/",      // URL do feed RSS do Polygon
        channelId: "1458649574729056391"                   // ID do canal do Discord para Polygon
      }
      {
        feed: "https://www.polygon.com/feed/entertainment/",      // URL do feed RSS do Polygon
        channelId: "1458654395280654533"                   // ID do canal do Discord para Polygon
      }
      // Podemos adicionar mais feeds aqui futuramente
    ]
  }
};


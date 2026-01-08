// src/config/defaultConfig.js

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
        name: "IGN_PC",                                      // Nome do feed
        feed: "https://feeds.ign.com/ign/pc-all",           // URL RSS
        channelId: "1431959790174736446"                             // Substituir pelo ID do canal do Discord
      }
      // Podemos adicionar mais feeds aqui futuramente
    ]
  }
};


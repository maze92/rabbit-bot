/**
 * Configuração principal do bot
 * Este ficheiro centraliza todas as opções configuráveis
 * (prefixo, moderação, logs, feeds RSS, etc.)
 */

module.exports = {

  // ==============================
  // Prefixo do bot
  // ==============================
  prefix: '!', // Prefixo usado nos comandos (ex: !help)

  // ==============================
  // Configurações gerais
  // ==============================
  language: 'en',           // Idioma principal do bot (futuro uso)
  logChannelName: 'log-bot',// Canal onde os logs são enviados

  // ==============================
  // Moderação automática (AutoMod)
  // ==============================
  maxWarnings: 3,           // Quantidade máxima de warns antes do mute
  muteDuration: 10 * 60 * 1000, // Duração do mute (10 minutos)

  /**
   * Palavras proibidas
   * - Separadas por idioma
   * - O sistema ignora maiúsculas/minúsculas
   * - Links e símbolos são removidos antes da verificação
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
  // Sistema de Game News (RSS)
  // ==============================
  gameNews: {
    enabled: true,               // Ativa/desativa o sistema
    interval: 30 * 60 * 1000,    // Intervalo de checagem (30 minutos)

    /**
     * Lista de feeds RSS
     * - name: nome interno (usado no log)
     * - feed: URL do RSS
     * - channelId: canal onde as notícias serão enviadas
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

// src/config/defaultConfig.js

module.exports = {
  // Maximum warnings before auto mute
  maxWarnings: 3,

  // Mute duration in milliseconds (10 minutes)
  muteDuration: 10 * 60 * 1000,

  // Channel name where automatic logs are sent
  logChannelName: 'log-bot',

  // Default language
  language: 'en',

  // Prohibited words lists
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
  }
};

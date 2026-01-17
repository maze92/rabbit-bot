// src/config/defaultConfig.js

const fs = require('fs');
const path = require('path');

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) return target;

  for (const [k, v] of Object.entries(source)) {
    if (isPlainObject(v) && isPlainObject(target[k])) {
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

const baseConfig = {
  prefix: '!',
  // Bot language for messages & AutoMod (supported: 'en', 'pt')
  language: 'pt',
  logChannelName: 'log-bot',

  staffRoles: [
    '1385619241235120177',
    '1385619241235120174',
    '1385619241235120173'
  ],

  notifications: {
    dmOnWarn: true,
    dmOnMute: true
  },

  maxWarnings: 3,
  muteDuration: 10 * 60 * 1000, // 10 min

  trust: {
    enabled: true,

    // Users start neutral
    base: 50,
    min: 0,
    max: 100,

    // Penalties
    warnPenalty: 8,
    mutePenalty: 20,

    // Regen (days without infractions)
    regenPerDay: 2,
    regenMaxDays: 21,

    // Risk thresholds
    lowThreshold: 25,
    highThreshold: 75,

    // Behaviour adjustments for low-trust users
    lowTrustWarningsPenalty: 1,
    lowTrustMessagesPenalty: 2,

    // Optional bonus tolerance for high-trust users (anti-spam)
    highTrustMessagesBonus: 1,

    // Mute duration multipliers
    lowTrustMuteMultiplier: 2.0,
    highTrustMuteMultiplier: 0.6
  },

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

  cooldowns: {
    default: 3000,
    warn: 5000,
    mute: 5000,
    unmute: 5000,
    clear: 8000
  },

  antiSpam: {
    enabled: true,

    // Time window to analyze spam
    interval: 10 * 1000,

    // Similar messages tolerated in the time window (before action)
    maxMessages: 5,

    // Base penalty (trust will adjust)
    muteDuration: 5 * 60 * 1000,

    // Cooldown between punishments for the same user
    actionCooldown: 2 * 60 * 1000,

    // Soft enforcement: first trigger => WARN, second within window => MUTE
    softActions: {
      enabled: true,
      strikeWindowMs: 10 * 60 * 1000,
      strikesToMute: 2
    },
    bypassAdmins: true,
    bypassRoles: [],
    sendMessage: true,
  
    minLength: 6,
    ignoreAttachments: true,
    similarityThreshold: 0.85,
  
    channels: {
      // 'ID_DO_CANAL_MEMES': {
      //   maxMessages: 10,
      //   interval: 7000,
      //   muteDuration: 30 * 1000
      // }
    }
  },

  dashboard: {
    enabled: true,
    maxLogs: 200,
    maxDbLogs: 1000,
    requireAuth: true
  },

  gameNews: {
    enabled: true,
    interval: 30 * 60 * 1000,
    keepHashes: 10,
    maxAgeDays: 7,
    jitterMs: 20000,
    perFeedJitterMs: 1500,
    retry: {
      attempts: 2,
      baseDelayMs: 1200,
      jitterMs: 800
    },
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
  },

  // Slash Commands
  slash: {
    enabled: true,

    // ✅ Recomendo pôr o ID do teu servidor (para registar rápido e evitar cache global)
    // Se deixares vazio, tenta registar GLOBAL (demora a propagar).
    guildId: '1385619241235120168',

    // regista automaticamente no arranque
    registerOnStartup: true
  }
};

// Runtime overrides (written by dashboard/configManager)
try {
  const overridesPath = path.join(__dirname, 'overrides.json');
  if (fs.existsSync(overridesPath)) {
    const raw = fs.readFileSync(overridesPath, 'utf8');
    const overrides = JSON.parse(raw);
    if (isPlainObject(overrides)) {
      deepMerge(baseConfig, overrides);
    }
  }
} catch (e) {
  console.warn('[Config] Failed to load overrides.json:', e?.message || e);
}

module.exports = baseConfig;

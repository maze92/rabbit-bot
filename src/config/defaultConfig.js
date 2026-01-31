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

  staffRoles: (process.env.STAFF_ROLE_IDS
    ? String(process.env.STAFF_ROLE_IDS)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : []),

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
    requireAuth: true,
    // Lista de origens permitidas para o Socket.IO (dashboard).
    allowedOrigins: ['https://ozark-bot-production.up.railway.app'],
    // Canal global de logs do Dashboard (fallback, caso a guild ainda não tenha dashboardLogChannelId definido)
    dashboardLogsChannelId: process.env.DASHBOARD_LOG_CHANNEL_ID || null
  },

  tickets: {
    enabled: true,
    // Categoria onde os canais de ticket serão criados (opcional)
    categoryId: null,
    // Roles de staff com acesso aos tickets (se vazio, usa config.staffRoles)
    staffRoleIds: [],

    // Auto-clean de tickets fechados
    autoDeleteClosed: {
      enabled: true,
      // Tempo após o fecho para apagar o canal + registo (ms)
      delayMs: 24 * 60 * 60 * 1000
    }
  },

  // Automação de moderação (ações extra com base em warns/infrações)
  automation: {
    enabled: true,

    autoMute: {
      enabled: true,
      // Nº de warns para aplicar mute automático
      warnsToMute: 3,
      // Duração do mute automático
      muteDurationMs: 30 * 60 * 1000
    },

    autoKick: {
      enabled: true,
      // Nº total de infrações (qualquer tipo) para aplicar kick automático
      infractionsToKick: 5
    }
  },

  gameNews: {
    enabled: true,
    logEnabled: true,
    interval: 30 * 60 * 1000,
    // Número máximo de notícias enviadas por ciclo por feed (backlog)
    maxPerCycle: 3,
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
        channelId: null
      },
      {
        name: 'GameSpot/News',
        feed: 'https://www.gamespot.com/feeds/game-news',
        channelId: null
      },
      {
        name: 'GameSpot/NewGames',
        feed: 'https://www.gamespot.com/feeds/new-games',
        channelId: null
      }
    ]
  },


  maintenance: {
    enabled: true,
    // Intervalo entre tarefas de manutenção (ms)
    intervalMs: 6 * 60 * 60 * 1000, // 6h
    // Apagar infrações mais antigas que este número de dias
    pruneInfractionsOlderThanDays: 180,
    // Apagar logs do dashboard mais antigos que este número de dias
    pruneDashboardLogsOlderThanDays: 60
  },

  // Slash Commands
  slash: {
    enabled: true,

    // ✅ Recomendo pôr o ID do teu servidor (para registar rápido e evitar cache global)
    // Se deixares vazio, tenta registar GLOBAL (demora a propagar).
    guildId: process.env.SLASH_GUILD_ID || null,

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

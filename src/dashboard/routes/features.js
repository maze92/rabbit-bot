// src/dashboard/routes/features.js
//
// Rotas da tab "Funcionalidades": leitura e escrita de GuildConfig.features.
// Cada funcionalidade é guardada individualmente (um cartão por funcionalidade),
// o que evita que a dashboard tenha de enviar o objeto inteiro.

const { invalidateGuildConfig } = require('../../systems/guildConfigService');
const { FEATURE_DEFAULTS, normalizeFeature, normalizeFeatures } = require('../../systems/featuresService');
const { getFeatureText, applyTemplate } = require('../../systems/featureText');
const { getGuildLang } = require('../../systems/i18n');

const FEATURE_NAMES = Object.keys(FEATURE_DEFAULTS);

function toBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function toInt(v, fallback, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  if (typeof min === 'number' && n < min) return min;
  if (typeof max === 'number' && n > max) return max;
  return n;
}

function clampOptionalText(v, max) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
}

// Cor no formato #rrggbb; devolve o fallback se inválida.
function normalizeColor(v, fallback) {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

function formatPanelDate(lang, now) {
  try {
    return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-PT' : 'en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now || new Date());
  } catch {
    return '';
  }
}

// URL http(s) opcional (usada no banner das mensagens).
function urlOrNull(v, max) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || !/^https?:\/\//i.test(s)) return null;
  return s.slice(0, max);
}

/**
 * Normaliza o valor recebido da dashboard para o formato persistido.
 * Devolve sempre um objeto com apenas as chaves conhecidas da feature.
 */
function cleanFeatureValue(name, raw, sanitizeId) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = (v) => {
    const s = sanitizeId(String(v === null || v === undefined ? '' : v));
    return s || null;
  };

  switch (name) {
    case 'messageLogs':
      return {
        enabled: toBool(src.enabled),
        channelId: id(src.channelId),
        ignoreBots: src.ignoreBots === undefined ? true : toBool(src.ignoreBots)
      };

    case 'reactionRoles': {
      const entries = Array.isArray(src.entries) ? src.entries : [];
      const cleaned = [];
      for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        const emoji = typeof e.emoji === 'string' ? e.emoji.trim().slice(0, 64) : '';
        const roleId = id(e.roleId);
        if (!emoji || !roleId) continue;
        cleaned.push({ emoji, roleId });
        if (cleaned.length >= 20) break;
      }
      return {
        enabled: toBool(src.enabled),
        channelId: id(src.channelId),
        messageId: id(src.messageId),
        entries: cleaned
      };
    }

    case 'autoKick':
      return {
        enabled: toBool(src.enabled),
        infractionsToKick: toInt(src.infractionsToKick, 5, 1, 100)
      };

    case 'levels':
      return {
        enabled: toBool(src.enabled),
        xpMin: toInt(src.xpMin, 15, 1, 1000),
        xpMax: toInt(src.xpMax, 25, 1, 1000),
        cooldownSeconds: toInt(src.cooldownSeconds, 60, 0, 86400),
        announceChannelId: id(src.announceChannelId)
      };

    case 'starboard':
      return {
        enabled: toBool(src.enabled),
        channelId: id(src.channelId),
        threshold: toInt(src.threshold, 3, 1, 100),
        emoji: typeof src.emoji === 'string' && src.emoji.trim() ? src.emoji.trim().slice(0, 64) : '⭐'
      };

    case 'polls':
      return { enabled: toBool(src.enabled) };

    case 'verification':
      return {
        enabled: toBool(src.enabled),
        roleId: id(src.roleId),
        channelId: id(src.channelId),
        messageId: id(src.messageId),
        kickAfterMinutes: toInt(src.kickAfterMinutes, 0, 0, 10080),
        title: clampOptionalText(src.title, 120),
        description: clampOptionalText(src.description, 500),
        buttonLabel: clampOptionalText(src.buttonLabel, 80)
      };

    case 'tickets':
      return {
        enabled: toBool(src.enabled),
        channelId: id(src.channelId),
        messageId: id(src.messageId),
        openEmoji: typeof src.openEmoji === 'string' && src.openEmoji.trim() ? src.openEmoji.trim().slice(0, 64) : FEATURE_DEFAULTS.tickets.openEmoji,
        closeEmoji: typeof src.closeEmoji === 'string' && src.closeEmoji.trim() ? src.closeEmoji.trim().slice(0, 64) : FEATURE_DEFAULTS.tickets.closeEmoji,
        panelTitle: clampOptionalText(src.panelTitle, 120),
        panelDescription: clampOptionalText(src.panelDescription, 500),
        alreadyOpenMessage: clampOptionalText(src.alreadyOpenMessage, 300),
        welcomeMessage: clampOptionalText(src.welcomeMessage, 1200),
        closeMessage: clampOptionalText(src.closeMessage, 300)
      };

    case 'welcome':
      return {
        enabled: toBool(src.enabled),
        channelId: id(src.channelId),
        message: clampOptionalText(src.message, 500),
        embed: src.embed === undefined ? true : toBool(src.embed),
        color: normalizeColor(src.color, FEATURE_DEFAULTS.welcome.color),
        bannerUrl: urlOrNull(src.bannerUrl, 512)
      };

    case 'goodbye':
      return {
        enabled: toBool(src.enabled),
        channelId: id(src.channelId),
        message: clampOptionalText(src.message, 500),
        embed: src.embed === undefined ? true : toBool(src.embed),
        color: normalizeColor(src.color, FEATURE_DEFAULTS.goodbye.color),
        bannerUrl: urlOrNull(src.bannerUrl, 512)
      };

    case 'serverStats':
      return {
        enabled: toBool(src.enabled),
        showMembers: src.showMembers === undefined ? true : toBool(src.showMembers),
        showJoins: src.showJoins === undefined ? true : toBool(src.showJoins),
        showLeaves: src.showLeaves === undefined ? true : toBool(src.showLeaves),
        categoryId: id(src.categoryId),
        memberChannelId: id(src.memberChannelId),
        joinsChannelId: id(src.joinsChannelId),
        leavesChannelId: id(src.leavesChannelId),
        memberTemplate: clampOptionalText(src.memberTemplate, 100),
        joinsTemplate: clampOptionalText(src.joinsTemplate, 100),
        leavesTemplate: clampOptionalText(src.leavesTemplate, 100)
      };

    default:
      return null;
  }
}

/**
 * Garante que a mensagem de reaction roles tem as reações configuradas.
 * Falha em silêncio (a configuração já foi guardada).
 */
async function ensureReactions(message, entries) {
  const { emojiMatches, toReactable } = require('../../systems/reactionRoles');
  for (const entry of entries) {
    const reactable = toReactable(entry && entry.emoji);
    if (!reactable) continue;
    const existing = message && message.reactions && message.reactions.cache
      ? message.reactions.cache.find((r) => emojiMatches(entry.emoji, r.emoji))
      : null;
    if (existing) continue;
    try {
      await message.react(reactable);
    } catch (err) {
      console.warn(`[Dashboard] reactionRoles: não foi possível reagir com "${entry.emoji}":`, err?.message || err);
    }
  }
}

function registerFeaturesRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  requirePremium,
  sanitizeId,
  GuildConfig,
  getClient,
  recordAudit,
  getActorFromRequest
}) {
  const guardGuildQuery = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId' })
    : (req, res, next) => next();

  const guardGuildBody = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'body', key: 'guildId' })
    : (req, res, next) => next();

  const canViewConfig = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canViewConfig', 'canEditConfig'] })
    : (req, res, next) => next();

  const canEditConfig = typeof requirePerm === 'function'
    ? requirePerm({ anyOf: ['canEditConfig'] })
    : (req, res, next) => next();

  const premiumGuardBody = typeof requirePremium === 'function'
    ? requirePremium({ from: 'body', key: 'guildId' })
    : (req, res, next) => next();

  const guardPremiumTicketsBody = (req, res, next) => {
    const feature = String(req.body && req.body.feature || '').trim();
    if (feature !== 'tickets') return next();
    return premiumGuardBody(req, res, next);
  };

  const guardPremiumTicketsParam = (req, res, next) => {
    const feature = String(req.params && req.params.key || '').trim();
    if (feature !== 'tickets') return next();
    return premiumGuardBody(req, res, next);
  };

  // GET /api/features?guildId=123
  app.get('/api/features', requireDashboardAuth, canViewConfig, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      let cfg = await GuildConfig.findOne({ guildId }).lean();
      if (!cfg) {
        cfg = await GuildConfig.create({ guildId });
        cfg = cfg.toObject();
      }

      const features = normalizeFeatures(cfg.features);
      if (cfg.ticketThreadChannelId && features.tickets && !features.tickets.channelId) {
        features.tickets.channelId = cfg.ticketThreadChannelId;
        features.tickets.enabled = true;
      }
      return res.json({ ok: true, features });
    } catch (err) {
      console.error('[Dashboard] /api/features GET error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // POST /api/features  { guildId, feature, value }
  app.post('/api/features', requireDashboardAuth, canEditConfig, guardGuildBody, guardPremiumTicketsBody, async (req, res) => {
    try {
      const guildId = sanitizeId(req.body.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      const feature = String(req.body.feature || '').trim();
      if (!FEATURE_NAMES.includes(feature)) {
        return res.status(400).json({ ok: false, error: 'UNKNOWN_FEATURE' });
      }

      const value = cleanFeatureValue(feature, req.body.value, sanitizeId);
      if (!value) return res.status(400).json({ ok: false, error: 'INVALID_FEATURE_VALUE' });

      const client = typeof getClient === 'function' ? getClient() : null;

      // Cargos por reação: os atalhos ":nome:" são resolvidos para "<:nome:id>"
      // antes de persistir (o Discord só aceita o glifo ou o id do emoji).
      if ((feature === 'reactionRoles' || feature === 'tickets') && client) {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          const { resolveShortcodes } = require('../../systems/reactionRoles');
          if (feature === 'reactionRoles' && value.entries.length) {
            value.entries = resolveShortcodes(value.entries, guild);
          }
          if (feature === 'tickets') {
            const resolved = resolveShortcodes([
              { emoji: value.openEmoji },
              { emoji: value.closeEmoji }
            ], guild);
            value.openEmoji = resolved[0] && resolved[0].emoji ? resolved[0].emoji : value.openEmoji;
            value.closeEmoji = resolved[1] && resolved[1].emoji ? resolved[1].emoji : value.closeEmoji;
          }
        }
      }

      const update = { $set: { [`features.${feature}`]: value } };
      if (feature === 'tickets') {
        update.$set.ticketThreadChannelId = value.channelId || null;
      }

      await GuildConfig.findOneAndUpdate(
        { guildId },
        update,
        { returnDocument: 'after', upsert: true }
      ).lean();

      if (typeof recordAudit === 'function') {
        await recordAudit({
          req,
          action: 'features.update',
          guildId,
          actor: typeof getActorFromRequest === 'function' ? getActorFromRequest(req) : null,
          payload: { feature, enabled: value.enabled }
        });
      }

      invalidateGuildConfig(guildId);

      let outValue = value;

      // Estatísticas do servidor: cria/atualiza os canais ao ligar e remove-os ao desligar.
      if (feature === 'serverStats') {
        if (client) {
          try {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (guild) {
              const { refreshGuild, removeGuild } = require('../../systems/serverStats');
              if (value.enabled) await refreshGuild(client, guild, { force: true });
              else await removeGuild(guild, value);

              // Devolver os IDs de canal efetivamente persistidos: evita que a
              // dashboard os reenvie a null (o que duplicava canais ao "Testar").
              const fresh = await GuildConfig.findOne({ guildId }).lean();
              outValue = normalizeFeature(feature, fresh && fresh.features && fresh.features[feature]);
            }
          } catch (err) {
            console.warn('[Dashboard] serverStats apply failed:', err?.message || err);
          }
        }
      }

      // Provisionamento do painel de reaction roles (adicionar reações à mensagem).
      if (feature === 'reactionRoles' && value.enabled && value.channelId && value.messageId && value.entries.length) {
        if (client) {
          try {
            const channel = await client.channels.fetch(value.channelId).catch(() => null);
            const message = channel ? await channel.messages.fetch(value.messageId).catch(() => null) : null;
            if (message) await ensureReactions(message, value.entries);
          } catch (err) {
            console.warn('[Dashboard] reactionRoles provisioning failed:', err?.message || err);
          }
        }
      }

      return res.json({ ok: true, feature, value: outValue });
    } catch (err) {
      console.error('[Dashboard] /api/features POST error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // POST /api/features/:key/test  { guildId }
  // Executa uma amostra da funcionalidade no servidor (envia mensagem de teste,
  // atualiza os canais de estatísticas, etc.).
  app.post('/api/features/:key/test', requireDashboardAuth, canEditConfig, guardGuildBody, guardPremiumTicketsParam, async (req, res) => {
    try {
      const guildId = sanitizeId(req.body.guildId || '');
      const feature = String(req.params.key || '').trim();
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!FEATURE_NAMES.includes(feature)) return res.status(400).json({ ok: false, error: 'UNKNOWN_FEATURE' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      const client = typeof getClient === 'function' ? getClient() : null;
      if (!client) return res.status(503).json({ ok: false, error: 'CLIENT_UNAVAILABLE' });

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return res.status(400).json({ ok: false, error: 'GUILD_NOT_FOUND' });

      const cfg = await GuildConfig.findOne({ guildId }).lean();
      const config = normalizeFeature(feature, cfg && cfg.features && cfg.features[feature]);

      const { runFeatureTest } = require('../../systems/featureTests');
      const result = await runFeatureTest({ client, guild, feature, config });
      if (!result || result.ok === false) {
        return res.status(400).json({ ok: false, error: (result && result.error) || 'TEST_FAILED' });
      }

      return res.json({ ok: true, feature, info: result.info || null, data: result.data || null });
    } catch (err) {
      console.error('[Dashboard] /api/features/:key/test error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  async function publishFeatureMessage(req, res, featureKey) {
    try {
      const guildId = sanitizeId(req.body.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      const cfg = await GuildConfig.findOne({ guildId }).lean();
      const current = normalizeFeature(featureKey, cfg && cfg.features && cfg.features[featureKey]);

      const client = typeof getClient === 'function' ? getClient() : null;
      if (!client) return res.status(503).json({ ok: false, error: 'CLIENT_UNAVAILABLE' });

      if (featureKey === 'verification' && (!current.roleId || !current.channelId)) {
        return res.status(400).json({ ok: false, error: 'VERIFICATION_ROLE_CHANNEL_REQUIRED' });
      }
      if (featureKey === 'tickets' && !current.channelId) {
        return res.status(400).json({ ok: false, error: 'TICKETS_CHANNEL_REQUIRED' });
      }

      const channel = await client.channels.fetch(current.channelId).catch(() => null);
      if (!channel || typeof channel.send !== 'function') {
        return res.status(400).json({ ok: false, error: 'CHANNEL_NOT_FOUND' });
      }

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
      const { toReactable } = require('../../systems/reactionRoles');

      let payload = null;
      if (featureKey === 'verification') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`verify:${current.roleId}`)
            .setLabel(await getFeatureText({ guildId, feature: 'verification', field: 'buttonLabel', value: current.buttonLabel }))
            .setStyle(ButtonStyle.Success)
        );
        const embed = new EmbedBuilder()
          .setTitle(await getFeatureText({ guildId, feature: 'verification', field: 'title', value: current.title }))
          .setDescription(await getFeatureText({ guildId, feature: 'verification', field: 'description', value: current.description }));
        payload = { embeds: [embed], components: [row] };
      } else {
        const lang = await getGuildLang(guildId).catch(() => 'pt');
        const panelTitle = await getFeatureText({ guildId, feature: 'tickets', field: 'panelTitle', value: current.panelTitle });
        const panelDescription = await getFeatureText({
          guildId,
          feature: 'tickets',
          field: 'panelDescription',
          value: current.panelDescription,
          params: { emoji: current.openEmoji }
        });
        const panelFooter = await getFeatureText({ guildId, feature: 'tickets', field: 'panelFooter' });
        const now = new Date();
        const footerText = [panelFooter, formatPanelDate(lang, now)].filter(Boolean).join(' • ');
        payload = {
          embeds: [
            new EmbedBuilder()
              .setTitle(panelTitle)
              .setDescription(applyTemplate(panelDescription, { emoji: current.openEmoji }))
              .setFooter({ text: footerText })
              .setTimestamp(now)
          ]
        };
      }

      const message = await channel.send(payload);

      if (featureKey === 'tickets') {
        const reactable = toReactable(current.openEmoji);
        if (reactable) await message.react(reactable).catch(() => null);
      }

      const value = { ...current, messageId: message.id };
      await GuildConfig.findOneAndUpdate(
        { guildId },
        {
          $set: {
            [`features.${featureKey}`]: value,
            ...(featureKey === 'tickets' ? { ticketThreadChannelId: value.channelId || null } : {})
          }
        },
        { returnDocument: 'after', upsert: true }
      ).lean();
      invalidateGuildConfig(guildId);

      return res.json({ ok: true, value });
    } catch (err) {
      console.error(`[Dashboard] /api/features/${featureKey}/publish error:`, err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  }

  // POST /api/features/verification/publish  { guildId }
  // Publica (ou reaproveita) a mensagem de verificação com o botão e guarda o messageId.
  app.post('/api/features/verification/publish', requireDashboardAuth, canEditConfig, guardGuildBody, async (req, res) => {
    return publishFeatureMessage(req, res, 'verification');
  });

  // POST /api/features/tickets/publish  { guildId }
  // Publica a mensagem painel dos tickets e guarda o messageId.
  app.post('/api/features/tickets/publish', requireDashboardAuth, canEditConfig, guardGuildBody, premiumGuardBody, async (req, res) => {
    return publishFeatureMessage(req, res, 'tickets');
  });
}

module.exports = { registerFeaturesRoutes };

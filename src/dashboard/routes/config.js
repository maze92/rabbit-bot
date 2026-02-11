// src/dashboard/routes/config.js

function registerConfigRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  rateLimit,
  sanitizeId,
  GuildConfig,
  GuildConfigSchema,
  config
}) {
// Guild configuration (per-server)
// ==============================

const canViewConfig = typeof requirePerm === 'function'
  ? requirePerm({ anyOf: ['canViewConfig', 'canEditConfig'] })
  : (req, res, next) => next();

const canEditConfig = typeof requirePerm === 'function'
  ? requirePerm({ anyOf: ['canEditConfig'] })
  : (req, res, next) => next();

const guardGuildParam = typeof requireGuildAccess === 'function'
  ? requireGuildAccess({ from: 'params', key: 'guildId' })
  : (req, res, next) => next();

app.get('/api/guilds/:guildId/config', requireDashboardAuth, canViewConfig, guardGuildParam, async (req, res) => {
  try {
    if (!GuildConfig) {
      return res.status(500).json({ ok: false, error: 'GuildConfig model not available' });
    }

    const guildId = sanitizeId(req.params.guildId);
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    const doc = await GuildConfig.findOne({ guildId }).lean().catch(() => null);
    const trustConfig = config.trust || null;

    if (!doc) {
      return res.json({
        ok: true,
        config: {
          guildId,
          language: 'auto',
          timezone: null,
          logChannelId: null,
          dashboardLogChannelId: null,
          ticketThreadChannelId: null,
          staffRoleIds: [],
          staffRolesByFeature: {
            tickets: [],
            moderation: [],
            gamenews: [],
            logs: [],
            config: []
          },
          trust: trustConfig
        }
      });
    }

    return res.json({
      ok: true,
      config: {
        guildId: doc.guildId,
        language: doc.language || 'auto',
        timezone: doc.timezone || null,
        logChannelId: doc.logChannelId || null,
        dashboardLogChannelId: doc.dashboardLogChannelId || null,
        ticketThreadChannelId: doc.ticketThreadChannelId || null,
        staffRoleIds: Array.isArray(doc.staffRoleIds) ? doc.staffRoleIds : [],
        staffRolesByFeature: {
          tickets: Array.isArray(doc.staffRolesByFeature?.tickets) ? doc.staffRolesByFeature.tickets : [],
          moderation: Array.isArray(doc.staffRolesByFeature?.moderation) ? doc.staffRolesByFeature.moderation : [],
          gamenews: Array.isArray(doc.staffRolesByFeature?.gamenews) ? doc.staffRolesByFeature.gamenews : [],
          logs: Array.isArray(doc.staffRolesByFeature?.logs) ? doc.staffRolesByFeature.logs : [],
          config: Array.isArray(doc.staffRolesByFeature?.config) ? doc.staffRolesByFeature.config : []
        },
        trust: trustConfig
      }
    });
  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/config GET error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

app.post('/api/guilds/:guildId/config', requireDashboardAuth, canEditConfig, guardGuildParam, rateLimit({ windowMs: 20_000, max: 20, keyPrefix: 'rl:guildConfig:' }), async (req, res) => {
  try {
    if (!GuildConfig) {
      return res.status(500).json({ ok: false, error: 'GuildConfig model not available' });
    }

    const guildId = sanitizeId(req.params.guildId);
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    const { logChannelId, dashboardLogChannelId, ticketThreadChannelId, staffRoleIds, staffRolesByFeature, language, timezone } = req.body || {};

    const payload = {
      guildId,
      logChannelId: sanitizeId(logChannelId) || null,
      dashboardLogChannelId: sanitizeId(dashboardLogChannelId) || null,
      ticketThreadChannelId: sanitizeId(ticketThreadChannelId) || null,
      language: typeof language === 'string' ? language : undefined,
      timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : null
    };

    if (Array.isArray(staffRoleIds)) {
      payload.staffRoleIds = staffRoleIds.map((id) => sanitizeId(id)).filter(Boolean);
    }

    if (staffRolesByFeature && typeof staffRolesByFeature === 'object') {
      const byFeature = {};
      ['tickets', 'moderation', 'gamenews', 'logs', 'config'].forEach((k) => {
        if (Array.isArray(staffRolesByFeature[k])) {
          byFeature[k] = staffRolesByFeature[k].map((id) => sanitizeId(id)).filter(Boolean);
        }
      });
      payload.staffRolesByFeature = byFeature;
    }

    // Validação extra com Zod para garantir que o payload tem apenas valores esperados
    const candidate = {
      logChannelId: payload.logChannelId,
      dashboardLogChannelId: payload.dashboardLogChannelId,
      ticketThreadChannelId: payload.ticketThreadChannelId,
      staffRoleIds: payload.staffRoleIds,
      staffRolesByFeature: payload.staffRolesByFeature,
      language: payload.language,
      timezone: payload.timezone
    };

    const parseResult = GuildConfigSchema.safeParse(candidate);
    if (!parseResult.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid guild config payload'
      });
    }

      const doc = await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: payload },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();

      return res.json({
        ok: true,
        config: {
          guildId: doc.guildId,
          language: doc.language || 'auto',
          timezone: doc.timezone || null,
          logChannelId: doc.logChannelId || null,
          dashboardLogChannelId: doc.dashboardLogChannelId || null,
          ticketThreadChannelId: doc.ticketThreadChannelId || null,
          staffRoleIds: Array.isArray(doc.staffRoleIds) ? doc.staffRoleIds : [],
          staffRolesByFeature: {
            tickets: Array.isArray(doc.staffRolesByFeature?.tickets) ? doc.staffRolesByFeature.tickets : [],
            moderation: Array.isArray(doc.staffRolesByFeature?.moderation) ? doc.staffRolesByFeature.moderation : [],
            gamenews: Array.isArray(doc.staffRolesByFeature?.gamenews) ? doc.staffRolesByFeature.gamenews : [],
            logs: Array.isArray(doc.staffRolesByFeature?.logs) ? doc.staffRolesByFeature.logs : [],
            config: Array.isArray(doc.staffRolesByFeature?.config) ? doc.staffRolesByFeature.config : []
          },
          trust: config.trust || null
        }
      });  } catch (err) {
    console.error('[Dashboard] /api/guilds/:guildId/config POST error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});





}

module.exports = { registerConfigRoutes };

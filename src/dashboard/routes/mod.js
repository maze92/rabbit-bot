// src/dashboard/routes/mod.js

function registerModRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  rateLimit,
  sanitizeId,
  sanitizeText,
  getActorFromRequest,
  recordAudit,
  ModWarnSchema,
  ModMuteSchema,
  parseDuration,
  formatDuration,
  config,
  dashboardWarn,
  resolveGuildMember,
  ModError,
  mongoose,
  logger,
  warningsService,
  infractionsService,
  _getClient,
  _getModels,
  _getLogsCache
}) {
  const rlWarn = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'rl:mod:warn:' });
  const rlMute = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'rl:mod:mute:' });
  const rlUnmute = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'rl:mod:unmute:' });
  // Reset trust can be used in short bursts (bulk-cleanups). Keep protection, but avoid breaking UX.
  const rlReset = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'rl:mod:reset:' });
  // Removing infractions is often done in short bursts; allow higher throughput.
  const rlRemoveInf = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'rl:mod:removeInf:' });
  const rlOverview = rateLimit({ windowMs: 20_000, max: 30, keyPrefix: 'rl:mod:overview:' });

  const guardGuildBody = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'body', key: 'guildId' })
    : (req, res, next) => next();

  const guardGuildQuery = typeof requireGuildAccess === 'function'
    ? requireGuildAccess({ from: 'query', key: 'guildId' })
    : (req, res, next) => next();

  // Small in-memory cache for overview panels (per guild+range). Keeps DB load low
  // without affecting moderation actions. TTL is intentionally short.
  const _overviewCache = new Map(); // key -> { exp:number, value:any }
  const OVERVIEW_CACHE_TTL_MS = 45_000;

  function cacheGet(key) {
    const hit = _overviewCache.get(key);
    if (!hit) return null;
    if (!hit.exp || hit.exp < Date.now()) {
      _overviewCache.delete(key);
      return null;
    }
    return hit.value;
  }

  function cacheSet(key, value) {
    _overviewCache.set(key, { exp: Date.now() + OVERVIEW_CACHE_TTL_MS, value });
  }

  function getClient() {
    return typeof _getClient === 'function' ? _getClient() : null;
  }

  function getModels() {
    return typeof _getModels === 'function' ? _getModels() : {};
  }

  function getLogsCache() {
    return typeof _getLogsCache === 'function' ? _getLogsCache() : [];
  }

  // ==============================
  // Mod actions (Dashboard -> Bot)
  // ==============================

  const canAct = typeof requirePerm === 'function' ? requirePerm({ anyOf: ['canActOnCases'] }) : (req, res, next) => next();
  const canViewLogs = typeof requirePerm === 'function' ? requirePerm({ anyOf: ['canViewLogs', 'canActOnCases'] }) : (req, res, next) => next();

  app.post('/api/mod/warn', requireDashboardAuth, canAct, guardGuildBody, rlWarn, async (req, res) => {
    try {
      const body = req.body || {};
      const parseResult = ModWarnSchema.safeParse(body);
      if (!parseResult.success) {
        return res.status(400).json({ ok: false, error: 'Invalid warn payload' });
      }

      const { guildId: g0, userId: u0, reason: r0 } = parseResult.data;
      const guildId = sanitizeId(g0);
      const userId = sanitizeId(u0);
      const reason = sanitizeText(r0, { maxLen: 1000, stripHtml: true });
      const actor = getActorFromRequest(req);

      await recordAudit({
        req,
        action: 'mod.warn',
        guildId,
        targetUserId: userId,
        actor,
        payload: { reason }
      });

      if (!guildId || !userId) {
        return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
      }

      const client = getClient();
      if (!client) {
        return res.status(500).json({ ok: false, error: 'Client not ready' });
      }

      const result = await dashboardWarn({
        client,
        guildId,
        userId,
        reason,
        actor
      });

      const dbUser = result && result.dbUser ? result.dbUser : null;

      return res.json({
        ok: true,
        dbUser: dbUser ? { warnings: dbUser.warnings, trust: dbUser.trust } : null
      });
    } catch (err) {
      console.error('[Dashboard] /api/mod/warn error:', err);

      if (err && err.code) {
        if (err.code === 'USER_NOT_FOUND_IN_GUILD') {
          return res.status(404).json({ ok: false, error: 'User not found in guild' });
        }
        if (err.code === 'BOT_MEMBER_NOT_AVAILABLE') {
          return res.status(500).json({ ok: false, error: 'Bot member not available' });
        }
        if (err.code === 'CANNOT_WARN_BOT') {
          return res.status(400).json({ ok: false, error: 'Cannot warn the bot' });
        }
        if (err.code === 'TARGET_ROLE_HIGHER_OR_EQUAL') {
          return res.status(400).json({ ok: false, error: 'Target role is higher or equal to bot' });
        }
        if (err.code === 'CANNOT_WARN_ADMINS') {
          return res.status(400).json({ ok: false, error: 'Cannot warn administrators via dashboard' });
        }
        if (err.code === 'CLIENT_NOT_READY') {
          return res.status(500).json({ ok: false, error: 'Client not ready' });
        }
      }

      return res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
  });

  app.post('/api/mod/mute', requireDashboardAuth, canAct, guardGuildBody, rlMute, async (req, res) => {
    try {
      const body = req.body || {};
      const parseResult = ModMuteSchema.safeParse(body);
      if (!parseResult.success) {
        return res.status(400).json({ ok: false, error: 'Invalid mute payload' });
      }

      const { guildId: g0, userId: u0, duration: d0, reason: r0 } = parseResult.data;
      const guildId = sanitizeId(g0);
      const userId = sanitizeId(u0);
      const duration = sanitizeText(d0, { maxLen: 32, stripHtml: true });
      const reason = sanitizeText(r0, { maxLen: 1000, stripHtml: true });
      const actor = getActorFromRequest(req);

      await recordAudit({
        req,
        action: 'mod.mute',
        guildId,
        targetUserId: userId,
        actor,
        payload: { reason }
      });

      if (!guildId || !userId) {
        return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
      }

      const client = getClient();
      if (!client) {
        return res.status(500).json({ ok: false, error: 'Client not ready' });
      }

      const r = reason || 'Dashboard mute';
      const parsed = parseDuration(duration);
      const durationMs = parsed || config.muteDuration || 10 * 60 * 1000;

      const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
      if (durationMs > MAX_TIMEOUT_MS) {
        return res.status(400).json({ ok: false, error: 'Duration too long (max 28d).' });
      }

      const { guild, member } = await resolveGuildMember(client, guildId, userId);
      if (!guild || !member) {
        return res.status(404).json({ ok: false, error: 'User not found in guild' });
      }

      const me = guild.members.me;
      if (!me) {
        return res.status(500).json({ ok: false, error: 'Bot member not available' });
      }

      if (member.id === me.id) {
        return res.status(400).json({ ok: false, error: 'Cannot mute the bot' });
      }

      if (member.roles.highest.position >= me.roles.highest.position) {
        return res.status(400).json({ ok: false, error: 'Target role is higher or equal to bot' });
      }

      if (!member.moderatable) {
        return res.status(400).json({ ok: false, error: 'Member is not moderatable by the bot' });
      }

      await member.timeout(durationMs, `Muted by dashboard: ${r}`).catch((e) => {
        throw new Error(e?.message || 'Failed to timeout');
      });

      const dbUser = await warningsService.applyMutePenalty(guild.id, member.id).catch(() => null);

      // Persist an infraction for history
      await infractionsService.create({
        guild,
        user: member.user,
        moderator: client.user,
        type: 'MUTE',
        reason: actor ? `${r} (dashboard: ${actor})` : r,
        duration: durationMs,
        source: 'dashboard'
      }).catch(() => null);

      await logger(
        client,
        'Dashboard Mute',
        member.user,
        client.user,
        `Duration: **${formatDuration(durationMs)}**\nReason: **${r}**` + (actor ? `\nExecutor (dashboard): **${actor}**` : ''),
        guild
      ).catch(() => null);

      return res.json({ ok: true, durationMs, durationLabel: formatDuration(durationMs), dbUser: dbUser ? { warnings: dbUser.warnings, trust: dbUser.trust } : null });
    } catch (err) {
      console.error('[Dashboard] /api/mod/mute error:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' });
    }
  });

  app.post('/api/mod/unmute', requireDashboardAuth, canAct, guardGuildBody, rlUnmute, async (req, res) => {
    try {
      const body = req.body || {};
      const parseResult = ModWarnSchema.safeParse(body);
      if (!parseResult.success) {
        return res.status(400).json({ ok: false, error: 'Invalid warn payload' });
      }

      const { guildId: g0, userId: u0, reason: r0 } = parseResult.data;
      const guildId = sanitizeId(g0);
      const userId = sanitizeId(u0);
      const reason = sanitizeText(r0, { maxLen: 1000, stripHtml: true });
      const actor = getActorFromRequest(req);

      await recordAudit({
        req,
        action: 'mod.unmute',
        guildId,
        targetUserId: userId,
        actor,
        payload: { reason }
      });

      if (!guildId || !userId) {
        return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
      }

      const client = getClient();
      if (!client) {
        return res.status(500).json({ ok: false, error: 'Client not ready' });
      }

      const r = reason || 'Dashboard unmute';

      const { guild, member } = await resolveGuildMember(client, guildId, userId);
      if (!guild || !member) {
        return res.status(404).json({ ok: false, error: 'User not found in guild' });
      }

      const me = guild.members.me;
      if (!me) {
        return res.status(500).json({ ok: false, error: 'Bot member not available' });
      }

      if (member.roles.highest.position >= me.roles.highest.position) {
        return res.status(400).json({ ok: false, error: 'Target role is higher or equal to bot' });
      }

      await member.timeout(null, `Unmuted by dashboard: ${r}`).catch((e) => {
        throw new Error(e?.message || 'Failed to remove timeout');
      });

      await logger(
        client,
        'Dashboard Unmute',
        member.user,
        client.user,
        `Reason: **${r}**` + (actor ? `\nExecutor (dashboard): **${actor}**` : ''),
        guild
      ).catch(() => null);

      return res.json({ ok: true });
    } catch (err) {
      console.error('[Dashboard] /api/mod/unmute error:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' });
    }
  });

  app.post('/api/mod/reset-trust', requireDashboardAuth, canAct, guardGuildBody, rlReset, async (req, res) => {
    try {
      const body = req.body || {};
      const parseResult = ModWarnSchema.safeParse(body);
      if (!parseResult.success) {
        return res.status(400).json({ ok: false, error: 'Invalid warn payload' });
      }

      const { guildId: g0, userId: u0, reason: r0 } = parseResult.data;
      const guildId = sanitizeId(g0);
      const userId = sanitizeId(u0);
      const reason = sanitizeText(r0, { maxLen: 1000, stripHtml: true });
      const actor = getActorFromRequest(req);

      await recordAudit({
        req,
        action: 'mod.resetTrust',
        guildId,
        targetUserId: userId,
        actor,
        payload: { reason }
      });

      if (!guildId || !userId) {
        return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
      }

      const client = getClient();
      if (!client) {
        return res.status(500).json({ ok: false, error: 'Client not ready' });
      }

      const { guild, member } = await resolveGuildMember(client, guildId, userId);
      if (!guild || !member) {
        return res.status(404).json({ ok: false, error: 'User not found in guild' });
      }

      const me = guild.members.me;
      if (!me) {
        return res.status(500).json({ ok: false, error: 'Bot member not available' });
      }

      if (member.roles.highest && me.roles.highest && member.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
        return res.status(403).json({ ok: false, error: 'User has higher or equal role' });
      }

      const baseReason = reason || 'Dashboard reset trust/warnings';
      const trustCfg = require('../../utils/trust').getTrustConfig();
      const baseTrust = typeof trustCfg.base === 'number' ? trustCfg.base : 0;

      const dbUser = await warningsService.resetUser(guild.id, member.id, baseTrust, baseReason).catch(() => null);

      // Clear timeout if present
      try {
        const hasTimeoutFlag =
          typeof member.isCommunicationDisabled === 'function'
            ? member.isCommunicationDisabled()
            : !!member.communicationDisabledUntilTimestamp;

        if (hasTimeoutFlag && typeof member.timeout === 'function') {
          await member.timeout(null, baseReason).catch(() => null);
        }
      } catch (_) {}

      // Remove infractions history for this user in this guild
      const { Infraction } = getModels();
      if (Infraction) {
        try {
          await Infraction.deleteMany({ guildId: guild.id, userId: member.id }).exec();
        } catch (_) {}
      }

      return res.json({ ok: true, dbUser: dbUser ? { warnings: dbUser.warnings, trust: dbUser.trust } : null });
    } catch (err) {
      console.error('[Dashboard] /api/mod/reset-trust error:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' });
    }
  });

  app.post('/api/mod/remove-infraction', requireDashboardAuth, canAct, guardGuildBody, rlRemoveInf, async (req, res) => {
    try {
      const { guildId: g0, userId: u0, infractionId: id0 } = req.body || {};
      const guildId = sanitizeId(g0);
      const userId = sanitizeId(u0);
      const infractionId = typeof id0 === 'string' || typeof id0 === 'number' ? String(id0) : null;
      const actor = getActorFromRequest(req);

      await recordAudit({
        req,
        action: 'mod.removeInfraction',
        guildId,
        targetUserId: userId,
        actor,
        payload: { infractionId }
      });

      if (!guildId || !userId || !infractionId) {
        return res.status(400).json({ ok: false, error: 'Missing guildId, userId or infractionId' });
      }

      const { Infraction } = getModels();
      if (!Infraction) {
        return res.status(500).json({ ok: false, error: 'Infraction model not available' });
      }

      const rawCollection = Infraction.collection;
      if (!rawCollection) {
        return res.status(500).json({ ok: false, error: 'Infractions collection not available' });
      }

      const orFilters = [];

      if (infractionId) {
        if (typeof infractionId === 'string' && /^[0-9a-fA-F]{24}$/.test(infractionId)) {
          try {
            orFilters.push({ _id: new mongoose.Types.ObjectId(infractionId), guildId, userId });
          } catch (_) {}
        }

        orFilters.push({ _id: infractionId, guildId, userId });

        const asNumber = Number(infractionId);
        if (Number.isFinite(asNumber)) {
          orFilters.push({ caseId: asNumber, guildId, userId });
        }
      }

      const query = orFilters.length ? { $or: orFilters } : { guildId, userId };

      const inf = await rawCollection.findOne(query);
      if (!inf) {
        return res.status(404).json({ ok: false, error: 'Infraction not found' });
      }

      // permission guard (role hierarchy) if we can resolve
      const client = getClient();
      if (client) {
        try {
          const resolved = await resolveGuildMember(client, guildId, userId);
          const guild = resolved.guild;
          const member = resolved.member;
          if (guild && member && guild.members && guild.members.me) {
            const me = guild.members.me;
            if (member.roles?.highest && me.roles?.highest && member.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
              return res.status(403).json({ ok: false, error: 'User has higher or equal role' });
            }
          }
        } catch (_) {}
      }

      if (typeof warningsService.removeInfractionEffects === 'function') {
        try {
          await warningsService.removeInfractionEffects(guildId, userId, inf.type || '');
        } catch (_) {}
      }

      await rawCollection.deleteOne({ _id: inf._id, guildId, userId });

      return res.json({ ok: true });
    } catch (err) {
      console.error('[Dashboard] /api/mod/remove-infraction error:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' });
    }
  });

  app.get('/api/mod/overview', requireDashboardAuth, canViewLogs, guardGuildQuery, rlOverview, async (req, res) => {
    try {
      const guildId = (req.query.guildId || '').toString().trim();
      if (!guildId) {
        return res.status(400).json({ ok: false, error: 'Missing guildId' });
      }

      // Supported ranges for server insights.
      // Keep backward compatibility for older clients using 24h/1y.
      const rawRange = (req.query.range || '7d').toString();
      const range = ['7d', '14d', '30d', '24h', '1y'].includes(rawRange) ? rawRange : '7d';
      let windowHours = 24 * 7;
      if (range === '24h') windowHours = 24;
      else if (range === '14d') windowHours = 24 * 14;
      else if (range === '30d') windowHours = 24 * 30;
      else if (range === '1y') windowHours = 24 * 365;

      const now = new Date();
      const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

      const cacheKey = `modOverview:${guildId}:${range}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const result = {
        ok: true,
        guildId,
        windowHours,
        range,
        since: since.toISOString(),
        // Your bot does not implement ban/kick. Keep fields for backwards compatibility,
        // but only compute what is real: WARN and MUTE infractions.
        moderationCounts: { warn: 0, mute: 0, unmute: 0, kick: 0, ban: 0, other: 0 },
        tickets: { total: 0, open: 0, closed: 0 }
      };

      const { DashboardLog, TicketLog, Infraction, User } = getModels();

      // Moderation counts: use infractions as the single source of truth.
      // (No ban/kick in this bot; unmute is not tracked as an infraction.)
      try {
        if (Infraction) {
          const rows = await Infraction.aggregate([
            { $match: { guildId, createdAt: { $gte: since } } },
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ]);

          result.moderationCounts.warn = 0;
          result.moderationCounts.mute = 0;

          for (const row of rows || []) {
            const k = String(row._id || '').toUpperCase();
            const c = Number(row.count || 0) || 0;
            if (k === 'WARN') result.moderationCounts.warn = c;
            else if (k === 'MUTE') result.moderationCounts.mute = c;
          }
        }
      } catch (err) {
        console.error('[Dashboard] /api/mod/overview infraction counts error:', err);
      }

      try {
        if (TicketLog) {
          const tq = { guildId, createdAt: { $gte: since } };
          const tickets = await TicketLog.find(tq, { createdAt: 1, closedAt: 1 }).lean();
          result.tickets.total = tickets.length;
          for (const t of tickets) {
            if (t.closedAt) result.tickets.closed++;
            else result.tickets.open++;
          }
        }
      } catch (err) {
        console.error('[Dashboard] /api/mod/overview tickets error:', err);
      }

      // Trust risk breakdown (optional). Helps the "Server Insights" panel.
      // Safe to ignore if User model is not available.
      try {
        if (User) {
          const rows = await User.aggregate([
            { $match: { guildId } },
            {
              $bucket: {
                groupBy: '$trust',
                boundaries: [0, 21, 41, 61, 81, 101],
                default: 'unknown',
                output: { count: { $sum: 1 } }
              }
            }
          ]);

          const map = new Map();
          for (const r of rows || []) {
            map.set(String(r._id), Number(r.count || 0) || 0);
          }

          result.riskBreakdown = [
            { label: '0-20', value: map.get('0') || 0 },
            { label: '21-40', value: map.get('21') || 0 },
            { label: '41-60', value: map.get('41') || 0 },
            { label: '61-80', value: map.get('61') || 0 },
            { label: '81-100', value: map.get('81') || 0 }
          ];
        }
      } catch (err) {
        console.error('[Dashboard] /api/mod/overview risk breakdown error:', err);
      }


      // Provide a stable, frontend-friendly stats object.
      try {
        const mc = result.moderationCounts || {};
        const warns = Number(mc.warn || 0) || 0;
        const mutes = Number(mc.mute || 0) || 0;
        result.stats = {
          totalActions: warns + mutes,
          warns,
          mutes
        };
      } catch (_) {}
      cacheSet(cacheKey, result);
      return res.json(result);
    } catch (err) {
      console.error('[Dashboard] /api/mod/overview error:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' });
    }
  });
}

module.exports = { registerModRoutes };

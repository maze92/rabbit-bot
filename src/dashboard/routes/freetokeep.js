// src/dashboard/routes/freetokeep.js

const { z } = require('zod');

const FreeToKeepConfigSchema = z.object({
  guildId: z.string().min(1),
  enabled: z.boolean().optional(),
  channelId: z.string().optional(),
  platforms: z
    .object({
      epic: z.boolean().optional(),
      steam: z.boolean().optional(),
      ubisoft: z.boolean().optional()
    })
    .optional(),
  pollIntervalMs: z.number().int().optional(),
  maxPerCycle: z.number().int().optional()
});

function boolish(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function registerFreeToKeepRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  rateLimit,
  sanitizeId,
  FreeToKeepConfig,
  FreeToKeepPost
}) {
  const guardGuildQuery = requireGuildAccess({ from: 'query', key: 'guildId' });
  const guardGuildBody = requireGuildAccess({ from: 'body', key: 'guildId' });

  // Read config
  app.get('/api/freetokeep/config', rateLimit, requireDashboardAuth, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId);
      const cfg = await FreeToKeepConfig.findOne({ guildId }).lean();
      return res.json({ ok: true, config: cfg || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  // Upsert config
  app.put('/api/freetokeep/config', rateLimit, requireDashboardAuth, requirePerm('admin'), guardGuildBody, async (req, res) => {
    try {
      const parsed = FreeToKeepConfigSchema.parse(req.body || {});
      const guildId = sanitizeId(parsed.guildId);

      const update = {};
      if (typeof parsed.enabled === 'boolean') update.enabled = parsed.enabled;
      if (typeof parsed.channelId === 'string') update.channelId = sanitizeId(parsed.channelId);

      if (parsed.platforms) {
        update.platforms = {
          epic: boolish(parsed.platforms.epic),
          steam: boolish(parsed.platforms.steam),
          ubisoft: boolish(parsed.platforms.ubisoft)
        };
      }

      if (typeof parsed.pollIntervalMs === 'number') {
        update.pollIntervalMs = clampInt(parsed.pollIntervalMs, 30_000, 30 * 60_000, 120_000);
      }
      if (typeof parsed.maxPerCycle === 'number') {
        update.maxPerCycle = clampInt(parsed.maxPerCycle, 1, 10, 3);
      }

      const cfg = await FreeToKeepConfig.findOneAndUpdate(
        { guildId },
        { $set: update, $setOnInsert: { guildId } },
        { upsert: true, new: true }
      ).lean();

      return res.json({ ok: true, config: cfg });
    } catch (e) {
      if (e?.name === 'ZodError') {
        return res.status(400).json({ ok: false, error: 'INVALID_BODY', details: e.errors });
      }
      return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  // Recent posts
  app.get('/api/freetokeep/recent', rateLimit, requireDashboardAuth, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId);
      const items = await FreeToKeepPost.find({ guildId })
        .sort({ postedAt: -1 })
        .limit(20)
        .lean();
      return res.json({ ok: true, items: items || [] });
    } catch {
      return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });
}

module.exports = { registerFreeToKeepRoutes };

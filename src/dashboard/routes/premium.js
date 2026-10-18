// src/dashboard/routes/premium.js
//
// Premium por servidor: leitura do estado, ativação manual pelo administrador
// do bot e o guard usado pelos módulos premium
// (gamenews, voz temporária, tickets, trust, giveaways).

const { normalizePremium, PREMIUM_MODULES } = require('../../systems/premium');
const { invalidateGuildConfig } = require('../../systems/guildConfigService');
const { createPayPalService } = require('../paypalService');

function parseDate(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getDashboardOrigin(req, config) {
  const configured = String(process.env.DASHBOARD_ORIGIN || '').split(',')[0].trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {}
  }
  if (process.env.NODE_ENV !== 'production' && req && req.get) {
    const host = req.get('host');
    if (host) return `${req.protocol}://${host}`;
  }
  if (process.env.NODE_ENV !== 'production' && config && config.dashboard && Array.isArray(config.dashboard.allowedOrigins)) {
    try {
      const url = new URL(String(config.dashboard.allowedOrigins[0] || ''));
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {}
  }
  return null;
}

function getCaptureDetails(payload) {
  if (payload && payload.resource) {
    const resource = payload.resource;
    return {
      orderId: resource.supplementary_data?.related_ids?.order_id || null,
      captureId: resource.id || null,
      status: resource.status || null,
      amount: resource.amount?.value || null,
      currency: resource.amount?.currency_code || null,
      userId: resource.custom_id || null,
      guildId: null,
      payerId: resource.payer?.payer_id || null,
      payerEmail: resource.payer?.email_address || null
    };
  }

  const unit = Array.isArray(payload && payload.purchase_units) ? payload.purchase_units[0] : null;
  const capture = unit && unit.payments && Array.isArray(unit.payments.captures)
    ? unit.payments.captures[0]
    : null;
  return {
    orderId: payload && payload.id ? String(payload.id) : null,
    captureId: capture && capture.id ? String(capture.id) : null,
    status: capture && capture.status ? capture.status : (payload && payload.status),
    amount: capture && capture.amount ? capture.amount.value : null,
    currency: capture && capture.amount ? capture.amount.currency_code : null,
    userId: unit && unit.custom_id ? String(unit.custom_id) : null,
    guildId: unit && unit.reference_id ? String(unit.reference_id) : null,
    payerId: payload && payload.payer ? payload.payer.payer_id || null : null,
    payerEmail: payload && payload.payer ? payload.payer.email_address || null : null
  };
}

function sameAmount(left, right) {
  const toCents = (value) => {
    const text = String(value || '');
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    return Math.round(Number(text) * 100);
  };
  const a = toCents(left);
  const b = toCents(right);
  return a !== null && b !== null && a === b;
}

function isPayPalLink(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && (url.hostname === 'paypal.com' || url.hostname.endsWith('.paypal.com') || url.hostname === 'paypal.me');
  } catch {
    return false;
  }
}

function activeEntitlement(entitlement) {
  if (!entitlement || entitlement.enabled !== true) return false;
  if (!entitlement.until) return true;
  const until = new Date(entitlement.until);
  return !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
}

/**
 * Guard reutilizável. O Premium pertence à conta Discord; a licença antiga
 * por guild continua aceite até expirar para evitar retirar acesso existente.
 */
function createPremiumGuard({ GuildConfig, PremiumEntitlement, sanitizeId }) {
  return function requirePremium({ from = 'body', key = 'guildId' } = {}) {
    return async (req, res, next) => {
      const user = req.dashboardUser;

      let raw = '';
      try {
        if (from === 'query') raw = (req.query && req.query[key]) || '';
        else if (from === 'params') raw = (req.params && req.params[key]) || '';
        else raw = (req.body && req.body[key]) || '';
      } catch {
        raw = '';
      }

      const guildId = typeof sanitizeId === 'function' ? sanitizeId(String(raw || '')) : String(raw || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });

      try {
        if (user && user.role === 'BOT_ADMIN') {
          if (GuildConfig) {
            const existing = await GuildConfig.findOne({ guildId }).select('premium').lean();
            if (!normalizePremium(existing && existing.premium).active) {
              const now = new Date();
              await GuildConfig.findOneAndUpdate(
                { guildId },
                { $set: { premium: {
                  enabled: true,
                  until: new Date(now.getTime() + 15 * 60 * 1000),
                  note: 'Bot admin test access',
                  activatedAt: now,
                  accountUserId: null,
                  testBypass: true
                } } },
                { upsert: true, returnDocument: 'after' }
              ).lean();
              invalidateGuildConfig(guildId);
            }
          }
          return next();
        }

        const userId = user && String(user._id || '');
        if (userId && PremiumEntitlement) {
          const entitlement = await PremiumEntitlement.findOne({ discordUserId: userId, enabled: true }).lean();
          const until = entitlement && entitlement.until ? new Date(entitlement.until) : null;
          if (entitlement && (!until || (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()))) {
            if (GuildConfig) {
              await GuildConfig.findOneAndUpdate(
                { guildId },
                { $set: { premium: {
                  enabled: true,
                  until: entitlement.until || null,
                  note: entitlement.note || 'Account Premium',
                  activatedAt: entitlement.activatedAt || new Date(),
                  accountUserId: userId,
                  testBypass: false
                } } },
                { upsert: true, returnDocument: 'after' }
              ).lean();
              invalidateGuildConfig(guildId);
            }
            return next();
          }
        }

        if (GuildConfig) {
          const cfg = await GuildConfig.findOne({ guildId }).select('premium').lean();
          const guildPremium = cfg && cfg.premium;
          if (guildPremium && !guildPremium.accountUserId && !guildPremium.testBypass && normalizePremium(guildPremium).active) return next();
        } else if (!PremiumEntitlement) {
          return next();
        }
      } catch (err) {
        console.warn('[Premium] verificação falhou:', err?.message || err);
      }

      return res.status(402).json({ ok: false, error: 'PREMIUM_REQUIRED' });
    };
  };
}

function registerPremiumRoutes({
  app,
  requireDashboardAuth,
  requirePerm,
  requireGuildAccess,
  sanitizeId,
  GuildConfig,
  PremiumPayment,
  PremiumEntitlement,
  PremiumSettings,
  config,
  rateLimit,
  paypal = createPayPalService()
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

  const canCheckout = canEditConfig;
  const checkoutRateLimit = typeof rateLimit === 'function'
    ? rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'rl:premium:checkout:' })
    : (req, res, next) => next();

  function requireBotAdmin(req, res, next) {
    if (!req.dashboardUser || req.dashboardUser.role !== 'BOT_ADMIN') {
      return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
    }
    return next();
  }

  async function getPlan() {
    const envPlan = paypal.getPlan();
    if (!PremiumSettings) return Object.assign({}, envPlan, { paymentLink: null });
    const settings = await PremiumSettings.findById('global').lean().catch(() => null);
    if (!settings) return Object.assign({}, envPlan, { paymentLink: null });
    const plan = paypal.normalizePlan({
      amount: settings.amount,
      currency: settings.currency,
      durationDays: settings.durationDays
    });
    return Object.assign({}, plan || envPlan, { paymentLink: settings.paymentLink || null });
  }

  app.get('/api/premium/admin/settings', requireDashboardAuth, requireBotAdmin, async (req, res) => {
    try {
      const settings = await getPlan();
      return res.json({ ok: true, settings });
    } catch (err) {
      console.error('[Dashboard] Premium settings read error:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.patch('/api/premium/admin/settings', requireDashboardAuth, requireBotAdmin, async (req, res) => {
    try {
      if (!PremiumSettings) return res.status(503).json({ ok: false, error: 'PREMIUM_SETTINGS_MODEL_MISSING' });
      const body = req.body || {};
      const plan = paypal.normalizePlan({ amount: body.amount, currency: body.currency, durationDays: body.durationDays });
      const paymentLink = String(body.paymentLink || '').trim();
      if (!plan) return res.status(400).json({ ok: false, error: 'PREMIUM_SETTINGS_INVALID' });
      if (!isPayPalLink(paymentLink)) return res.status(400).json({ ok: false, error: 'PREMIUM_PAYMENT_LINK_INVALID' });

      const settings = await PremiumSettings.findOneAndUpdate(
        { _id: 'global' },
        { $set: Object.assign({}, plan, { paymentLink: paymentLink || null, updatedBy: String(req.dashboardUser._id || '') }) },
        { upsert: true, returnDocument: 'after' }
      ).lean();
      return res.json({ ok: true, settings });
    } catch (err) {
      console.error('[Dashboard] Premium settings update error:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/api/premium/admin/users', requireDashboardAuth, requireBotAdmin, async (req, res) => {
    try {
      if (!PremiumEntitlement) return res.status(503).json({ ok: false, error: 'PREMIUM_ENTITLEMENT_MODEL_MISSING' });
      const entitlements = await PremiumEntitlement.find({}).sort({ updatedAt: -1 }).limit(200).lean();
      const userIds = entitlements.map((item) => item.discordUserId);
      const payments = PremiumPayment && userIds.length
        ? await PremiumPayment.find({ discordUserId: { $in: userIds } }).sort({ completedAt: -1 }).lean()
        : [];
      const latestByUser = new Map();
      payments.forEach((payment) => {
        if (!latestByUser.has(payment.discordUserId)) latestByUser.set(payment.discordUserId, payment);
      });
      const query = String(req.query.q || '').trim().toLowerCase();
      const items = entitlements.map((item) => {
        const latestPayment = latestByUser.get(item.discordUserId) || null;
        return {
          discordUserId: item.discordUserId,
          discordUsername: item.discordUsername,
          enabled: item.enabled === true,
          active: activeEntitlement(item),
          until: item.until,
          note: item.note,
          paymentLink: item.paymentLink,
          source: item.source,
          updatedBy: item.updatedBy,
          updatedAt: item.updatedAt,
          latestPayment: latestPayment ? {
            amount: latestPayment.amount,
            currency: latestPayment.currency,
            completedAt: latestPayment.completedAt,
            paypalPayerEmail: latestPayment.paypalPayerEmail,
            paypalCaptureId: latestPayment.paypalCaptureId,
            approvalUrl: latestPayment.approvalUrl
          } : null
        };
      }).filter((item) => !query || [item.discordUserId, item.discordUsername, item.latestPayment && item.latestPayment.paypalPayerEmail]
        .some((value) => String(value || '').toLowerCase().includes(query)));
      return res.json({ ok: true, items });
    } catch (err) {
      console.error('[Dashboard] Premium accounts read error:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.patch('/api/premium/admin/users/:userId', requireDashboardAuth, requireBotAdmin, async (req, res) => {
    try {
      if (!PremiumEntitlement) return res.status(503).json({ ok: false, error: 'PREMIUM_ENTITLEMENT_MODEL_MISSING' });
      const discordUserId = String(req.params.userId || '');
      if (!/^\d{10,32}$/.test(discordUserId)) return res.status(400).json({ ok: false, error: 'DISCORD_USER_ID_INVALID' });
      const body = req.body || {};
      if (typeof body.enabled !== 'boolean') return res.status(400).json({ ok: false, error: 'PREMIUM_ENABLED_REQUIRED' });
      const until = body.until ? parseDate(body.until) : null;
      if (body.until && !until) return res.status(400).json({ ok: false, error: 'PREMIUM_DATE_INVALID' });
      const paymentLink = String(body.paymentLink || '').trim();
      if (!isPayPalLink(paymentLink)) return res.status(400).json({ ok: false, error: 'PREMIUM_PAYMENT_LINK_INVALID' });
      const existing = await PremiumEntitlement.findOne({ discordUserId }).lean();
      const entitlement = await PremiumEntitlement.findOneAndUpdate(
        { discordUserId },
        {
          $set: {
            discordUserId,
            discordUsername: String(body.username || (existing && existing.discordUsername) || '').trim().slice(0, 80) || null,
            enabled: body.enabled,
            until,
            note: String(body.note || '').trim().slice(0, 200) || null,
            paymentLink: paymentLink || null,
            source: (existing && existing.source) || 'ADMIN',
            lastPaymentId: (existing && existing.lastPaymentId) || null,
            activatedAt: body.enabled ? (existing && existing.activatedAt) || new Date() : (existing && existing.activatedAt) || null,
            updatedBy: String(req.dashboardUser._id || '')
          }
        },
        { upsert: true, returnDocument: 'after' }
      ).lean();
      if (GuildConfig) {
        const projections = await GuildConfig.find({ 'premium.accountUserId': discordUserId })
          .select('guildId')
          .lean();
        await GuildConfig.updateMany(
          { 'premium.accountUserId': discordUserId },
          { $set: {
            'premium.enabled': body.enabled,
            'premium.until': until,
            'premium.note': entitlement.note || (body.enabled ? 'Account Premium' : 'Premium disabled'),
            'premium.activatedAt': entitlement.activatedAt || new Date()
          } }
        );
        (projections || []).forEach((projection) => invalidateGuildConfig(projection.guildId));
      }
      return res.json({ ok: true, entitlement: Object.assign({}, entitlement, { active: activeEntitlement(entitlement) }) });
    } catch (err) {
      console.error('[Dashboard] Premium account update error:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  function redirectPayment(req, res, status, guildId) {
    const origin = getDashboardOrigin(req, config);
    if (!origin) return res.status(503).send('Dashboard origin is not configured.');
    const url = new URL('/', origin);
    url.searchParams.set('premiumPayment', status);
    if (guildId) url.searchParams.set('guildId', String(guildId));
    return res.redirect(url.toString());
  }

  async function completePayment(payment, payload) {
    const capture = getCaptureDetails(payload);
    if (
      !capture.orderId || capture.orderId !== payment.paypalOrderId ||
      capture.status !== 'COMPLETED' || !capture.captureId ||
      capture.userId !== payment.discordUserId ||
      !sameAmount(capture.amount, payment.amount) ||
      String(capture.currency || '').toUpperCase() !== payment.currency ||
      (capture.guildId && capture.guildId !== payment.guildId)
    ) {
      await PremiumPayment.updateOne(
        { _id: payment._id, status: { $in: ['PENDING', 'PROCESSING'] } },
        { $set: { status: 'FAILED' } }
      );
      return false;
    }

    const claimed = await PremiumPayment.findOneAndUpdate(
      { _id: payment._id, status: 'PENDING' },
      { $set: { status: 'PROCESSING' } },
      { new: true }
    ).lean();
    if (!claimed) {
      const current = await PremiumPayment.findById(payment._id).lean();
      return Boolean(current && current.status === 'COMPLETED');
    }

    try {
      if (!PremiumEntitlement) throw new Error('PREMIUM_ENTITLEMENT_MODEL_MISSING');
      const currentEntitlement = await PremiumEntitlement.findOne({ discordUserId: payment.discordUserId }).lean();
      const now = new Date();
      const existingUntil = currentEntitlement && currentEntitlement.until ? new Date(currentEntitlement.until) : null;
      const startsAt = activeEntitlement(currentEntitlement) && existingUntil && existingUntil > now
        ? existingUntil
        : now;
      const expiresAt = new Date(startsAt.getTime() + payment.durationDays * 24 * 60 * 60 * 1000);

      await PremiumEntitlement.findOneAndUpdate(
        { discordUserId: payment.discordUserId },
        {
          $set: {
            discordUserId: payment.discordUserId,
            discordUsername: payment.discordUsername,
            enabled: true,
            until: expiresAt,
            note: 'PayPal',
            paymentLink: payment.approvalUrl || null,
            source: 'PAYPAL',
            lastPaymentId: payment.paypalCaptureId || capture.captureId
          }
        },
        { returnDocument: 'after', upsert: true }
      ).lean();

      await PremiumPayment.updateOne(
        { _id: payment._id, status: 'PROCESSING' },
        {
          $set: {
            status: 'COMPLETED',
            paypalCaptureId: capture.captureId,
            paypalPayerId: capture.payerId,
            paypalPayerEmail: capture.payerEmail,
            startsAt,
            expiresAt,
            completedAt: now
          }
        }
      );
      return true;
    } catch (err) {
      await PremiumPayment.updateOne(
        { _id: payment._id, status: 'PROCESSING' },
        { $set: { status: 'PENDING' } }
      ).catch(() => null);
      throw err;
    }
  }

  app.post('/api/premium/checkout', requireDashboardAuth, canCheckout, guardGuildBody, checkoutRateLimit, async (req, res) => {
    try {
      const guildId = sanitizeId(req.body && req.body.guildId);
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!PremiumPayment) return res.status(503).json({ ok: false, error: 'PREMIUM_PAYMENT_MODEL_MISSING' });
      const plan = await getPlan();
      if (!paypal.isConfigured(plan)) return res.status(503).json({ ok: false, error: 'PAYPAL_NOT_CONFIGURED' });

      const origin = getDashboardOrigin(req, config);
      if (!origin) return res.status(503).json({ ok: false, error: 'DASHBOARD_ORIGIN_NOT_CONFIGURED' });
      const user = req.dashboardUser || {};
      const userId = String(user._id || '');
      if (!/^\d{10,32}$/.test(userId)) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      const currentEntitlement = PremiumEntitlement
        ? await PremiumEntitlement.findOne({ discordUserId: userId }).lean()
        : null;
      if (activeEntitlement(currentEntitlement) && !currentEntitlement.until) {
        return res.status(409).json({ ok: false, error: 'PREMIUM_ALREADY_PERMANENT' });
      }

      const order = await paypal.createOrder({
        guildId,
        discordUserId: userId,
        returnUrl: `${origin}/api/premium/paypal/return`,
        cancelUrl: `${origin}/api/premium/paypal/cancel`,
        plan
      });
      await PremiumPayment.create({
        paypalOrderId: order.id,
        approvalUrl: order.approvalUrl,
        guildId,
        discordUserId: userId,
        discordUsername: String(user.username || 'Discord').slice(0, 80),
        amount: order.plan.amount,
        currency: order.plan.currency,
        durationDays: order.plan.durationDays,
        status: 'PENDING'
      });

      return res.json({
        ok: true,
        approvalUrl: order.approvalUrl,
        amount: order.plan.amount,
        currency: order.plan.currency,
        durationDays: order.plan.durationDays
      });
    } catch (err) {
      console.error('[Dashboard] Premium checkout error:', err?.message || err);
      return res.status(502).json({ ok: false, error: 'PAYPAL_CHECKOUT_FAILED' });
    }
  });

  app.get('/api/premium/paypal/return', async (req, res) => {
    let payment = null;
    try {
      const orderId = String(req.query.token || '');
      if (!/^[A-Za-z0-9-]{6,64}$/.test(orderId) || !PremiumPayment) {
        return redirectPayment(req, res, 'error');
      }
      payment = await PremiumPayment.findOne({ paypalOrderId: orderId }).lean();
      if (!payment) return redirectPayment(req, res, 'error');
      if (payment.status === 'COMPLETED') return redirectPayment(req, res, 'success', payment.guildId);

      const capture = await paypal.captureOrder(orderId);
      const completed = await completePayment(payment, capture);
      return redirectPayment(req, res, completed ? 'success' : 'error', payment.guildId);
    } catch (err) {
      console.error('[Dashboard] PayPal return error:', err?.message || err);
      return redirectPayment(req, res, 'error', payment && payment.guildId);
    }
  });

  app.get('/api/premium/paypal/cancel', async (req, res) => {
    const orderId = String(req.query.token || '');
    if (PremiumPayment && /^[A-Za-z0-9-]{6,64}$/.test(orderId)) {
      await PremiumPayment.updateOne(
        { paypalOrderId: orderId, status: 'PENDING' },
        { $set: { status: 'CANCELLED' } }
      ).catch(() => null);
    }
    const payment = PremiumPayment && /^[A-Za-z0-9-]{6,64}$/.test(orderId)
      ? await PremiumPayment.findOne({ paypalOrderId: orderId }).select('guildId').lean().catch(() => null)
      : null;
    return redirectPayment(req, res, 'cancelled', payment && payment.guildId);
  });

  app.post('/api/premium/paypal/webhook', async (req, res) => {
    const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
    if (!webhookId || !PremiumPayment) return res.status(503).json({ ok: false, error: 'PAYPAL_WEBHOOK_NOT_CONFIGURED' });
    try {
      const event = req.body;
      if (!await paypal.verifyWebhook({ headers: req.headers, webhookId, event })) {
        return res.status(400).json({ ok: false, error: 'PAYPAL_WEBHOOK_INVALID' });
      }
      if (!event || event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
        return res.json({ ok: true, ignored: true });
      }

      const capture = getCaptureDetails(event);
      const payment = capture.orderId
        ? await PremiumPayment.findOne({ paypalOrderId: capture.orderId }).lean()
        : null;
      if (!payment) return res.json({ ok: true, ignored: true });
      if (payment.status === 'COMPLETED') return res.json({ ok: true, duplicate: true });
      const completed = await completePayment(payment, event);
      if (!completed) return res.json({ ok: true, ignored: true });
      return res.json({ ok: true });
    } catch (err) {
      console.error('[Dashboard] PayPal webhook error:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'PAYPAL_WEBHOOK_PROCESSING_FAILED' });
    }
  });

  app.get('/api/premium/payments', requireDashboardAuth, requireBotAdmin, async (req, res) => {
    try {
      if (!PremiumPayment) return res.status(503).json({ ok: false, error: 'PREMIUM_PAYMENT_MODEL_MISSING' });
      const items = await PremiumPayment.find({ status: 'COMPLETED' })
        .sort({ completedAt: -1 })
        .limit(100)
        .lean();
      return res.json({
        ok: true,
        items: items.map((item) => ({
          guildId: item.guildId,
          discordUsername: item.discordUsername,
          discordUserId: item.discordUserId,
          paypalPayerEmail: item.paypalPayerEmail,
          approvalUrl: item.approvalUrl,
          paypalCaptureId: item.paypalCaptureId,
          amount: item.amount,
          currency: item.currency,
          completedAt: item.completedAt,
          expiresAt: item.expiresAt
        }))
      });
    } catch (err) {
      console.error('[Dashboard] Premium payments error:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // GET /api/premium?guildId=123
  app.get('/api/premium', requireDashboardAuth, canViewConfig, guardGuildQuery, async (req, res) => {
    try {
      const guildId = sanitizeId(req.query.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      const cfg = GuildConfig ? await GuildConfig.findOne({ guildId }).select('premium').lean() : null;
      const guildPremium = cfg && cfg.premium;
      const userId = String(req.dashboardUser && req.dashboardUser._id || '');
      const entitlement = PremiumEntitlement && userId
        ? await PremiumEntitlement.findOne({ discordUserId: userId }).lean()
        : null;
      const plan = await getPlan();
      const accountOwnsGuildProjection = !guildPremium || !guildPremium.accountUserId || guildPremium.accountUserId === userId;
      const projectedPremium = accountOwnsGuildProjection && !(guildPremium && guildPremium.testBypass)
        ? normalizePremium(guildPremium)
        : normalizePremium(null);
      const entitlementActive = activeEntitlement(entitlement);
      const paidActive = entitlementActive || projectedPremium.active;
      const testBypass = Boolean(req.dashboardUser && req.dashboardUser.role === 'BOT_ADMIN');
      const activeOtherAccountProjection = Boolean(
        guildPremium && guildPremium.accountUserId && guildPremium.accountUserId !== userId && normalizePremium(guildPremium).active
      );
      if (GuildConfig && (entitlementActive || (testBypass && !activeOtherAccountProjection)) && !projectedPremium.active) {
        const now = new Date();
        await GuildConfig.findOneAndUpdate(
          { guildId },
          { $set: { premium: entitlementActive ? {
            enabled: true,
            until: entitlement.until || null,
            note: entitlement.note || 'Account Premium',
            activatedAt: entitlement.activatedAt || now,
            accountUserId: userId,
            testBypass: false
          } : {
            enabled: true,
            until: new Date(now.getTime() + 15 * 60 * 1000),
            note: 'Bot admin test access',
            activatedAt: now,
            accountUserId: null,
            testBypass: true
          } } },
          { upsert: true, returnDocument: 'after' }
        ).lean();
        invalidateGuildConfig(guildId);
      }
      return res.json({
        ok: true,
        premium: {
          enabled: paidActive,
          active: paidActive,
          until: entitlementActive ? entitlement.until : projectedPremium.until,
          note: entitlementActive ? entitlement.note : projectedPremium.note,
          activatedAt: entitlement && entitlement.activatedAt ? entitlement.activatedAt : projectedPremium.activatedAt,
          testBypass,
          effectiveActive: paidActive || testBypass
        },
        modules: PREMIUM_MODULES,
        payment: {
          available: Boolean(GuildConfig && PremiumPayment && PremiumEntitlement && paypal.isConfigured(plan) && getDashboardOrigin(req, config)),
          amount: plan.amount,
          currency: plan.currency,
          durationDays: plan.durationDays,
          paymentLink: plan.paymentLink || null
        }
      });
    } catch (err) {
      console.error('[Dashboard] /api/premium GET error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

}

module.exports = { registerPremiumRoutes, createPremiumGuard };

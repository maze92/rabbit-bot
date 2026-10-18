// src/dashboard/routes/premium.js
//
// Premium por servidor: leitura do estado, ativação manual pelo administrador
// do bot e o guard usado pelos módulos premium
// (gamenews, voz temporária, tickets, trust, giveaways).

const { normalizePremium, PREMIUM_MODULES } = require('../../systems/premium');
const { invalidateGuildConfig } = require('../../systems/guildConfigService');
const { createPayPalService } = require('../paypalService');

function toBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

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
      guildId: resource.custom_id || null,
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
    guildId: unit && (unit.custom_id || unit.reference_id) ? String(unit.custom_id || unit.reference_id) : null,
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

/**
 * Guard reutilizável. Devolve 402 PREMIUM_REQUIRED quando o servidor não tem
 * premium ativo. Sem modelo disponível não bloqueia (ambiente degradado).
 */
function createPremiumGuard({ GuildConfig, sanitizeId }) {
  return function requirePremium({ from = 'body', key = 'guildId' } = {}) {
    return async (req, res, next) => {
      if (!GuildConfig) return next();

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
        const cfg = await GuildConfig.findOne({ guildId }).select('premium').lean();
        if (normalizePremium(cfg && cfg.premium).active) return next();
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
      !sameAmount(capture.amount, payment.amount) ||
      String(capture.currency || '').toUpperCase() !== payment.currency ||
      (!payload.resource && capture.guildId !== payment.guildId) ||
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
      const currentConfig = GuildConfig
        ? await GuildConfig.findOne({ guildId: payment.guildId }).select('premium').lean()
        : null;
      const currentPremium = normalizePremium(currentConfig && currentConfig.premium);
      const now = new Date();
      const startsAt = currentPremium.active && currentPremium.until && currentPremium.until > now
        ? currentPremium.until
        : now;
      const expiresAt = new Date(startsAt.getTime() + payment.durationDays * 24 * 60 * 60 * 1000);

      if (!GuildConfig) throw new Error('GUILD_CONFIG_MODEL_MISSING');
      await GuildConfig.findOneAndUpdate(
        { guildId: payment.guildId },
        {
          $set: {
            premium: {
              enabled: true,
              until: expiresAt,
              note: 'PayPal',
              activatedAt: currentPremium.activatedAt || now
            }
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
      invalidateGuildConfig(payment.guildId);
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
      if (!paypal.isConfigured()) return res.status(503).json({ ok: false, error: 'PAYPAL_NOT_CONFIGURED' });

      const origin = getDashboardOrigin(req, config);
      if (!origin) return res.status(503).json({ ok: false, error: 'DASHBOARD_ORIGIN_NOT_CONFIGURED' });
      const guildConfig = GuildConfig
        ? await GuildConfig.findOne({ guildId }).select('premium').lean()
        : null;
      const currentPremium = normalizePremium(guildConfig && guildConfig.premium);
      if (currentPremium.active && !currentPremium.until) {
        return res.status(409).json({ ok: false, error: 'PREMIUM_ALREADY_PERMANENT' });
      }

      const user = req.dashboardUser || {};
      const userId = String(user._id || '');
      if (!/^\d{10,32}$/.test(userId)) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const order = await paypal.createOrder({
        guildId,
        discordUserId: userId,
        returnUrl: `${origin}/api/premium/paypal/return`,
        cancelUrl: `${origin}/api/premium/paypal/cancel`
      });
      await PremiumPayment.create({
        paypalOrderId: order.id,
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

      const cfg = await GuildConfig.findOne({ guildId }).select('premium').lean();
      const plan = paypal.getPlan();
      return res.json({
        ok: true,
        premium: normalizePremium(cfg && cfg.premium),
        modules: PREMIUM_MODULES,
        payment: {
          available: Boolean(GuildConfig && PremiumPayment && paypal.isConfigured() && getDashboardOrigin(req, config)),
          amount: plan.amount,
          currency: plan.currency,
          durationDays: plan.durationDays
        }
      });
    } catch (err) {
      console.error('[Dashboard] /api/premium GET error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // POST /api/premium  { guildId, enabled, until?, note? }
  // Só um administrador do bot pode alterar o estado manualmente.
  app.post('/api/premium', requireDashboardAuth, canEditConfig, guardGuildBody, async (req, res) => {
    try {
      const user = req.dashboardUser;
      // Com autenticação desligada não há utilizador: não bloquear o modo local.
      if (user && user.role !== 'BOT_ADMIN') {
        return res.status(403).json({ ok: false, error: 'NO_PERMISSION' });
      }

      const guildId = sanitizeId(req.body.guildId || '');
      if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID_REQUIRED' });
      if (!GuildConfig) return res.status(503).json({ ok: false, error: 'GUILD_CONFIG_MODEL_MISSING' });

      const enabled = toBool(req.body.enabled);
      const until = parseDate(req.body.until);
      const note = typeof req.body.note === 'string' && req.body.note.trim()
        ? req.body.note.trim().slice(0, 200)
        : null;

      const premium = {
        enabled,
        until: enabled ? until : null,
        note,
        activatedAt: enabled ? new Date() : null
      };

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: { premium } },
        { returnDocument: 'after', upsert: true }
      ).lean();

      invalidateGuildConfig(guildId);

      return res.json({ ok: true, premium: normalizePremium(premium) });
    } catch (err) {
      console.error('[Dashboard] /api/premium POST error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });
}

module.exports = { registerPremiumRoutes, createPremiumGuard };

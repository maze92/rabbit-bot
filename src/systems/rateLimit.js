// src/systems/rateLimit.js

// Pequeno rate limit em memória, por IP
// NOTA: se usares muitos processos / múltiplas instâncias, idealmente usavas Redis.
// Para 1 instância (Railway, etc) isto chega bem.

const buckets = new Map();

/**
 * options:
 *  - windowMs: janela de tempo em ms (ex: 60_000 = 1 min)
 *  - max: número máximo de requests nessa janela
 */
function rateLimit(options = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 120;

  return (req, res, next) => {
    const now = Date.now();

    // tenta apanhar IP real
    const ip =
      req.ip ||
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress ||
      'unknown';

    let bucket = buckets.get(ip);

    if (!bucket) {
      bucket = { count: 1, start: now };
      buckets.set(ip, bucket);
      return next();
    }

    // se a janela expirou, recomeça
    if (now - bucket.start > windowMs) {
      bucket.count = 1;
      bucket.start = now;
      return next();
    }

    // ainda dentro da janela
    if (bucket.count >= max) {
      return res.status(429).json({
        ok: false,
        error: 'Too many requests',
        retryAfterMs: windowMs - (now - bucket.start),
      });
    }

    bucket.count++;
    next();
  };
}

module.exports = rateLimit;

// src/utils/log.js
//
// Lightweight logging helpers to avoid fully silent catches.
// In dev, log full errors; in prod, log compact messages to stderr.

function toErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    return err.message || String(err);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function logError(context, err) {
  const msg = toErrorMessage(err);
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, msg);
}

function logWarn(context, err) {
  const msg = toErrorMessage(err);
  // eslint-disable-next-line no-console
  console.warn(`[${context}]`, msg);
}

module.exports = {
  logError,
  logWarn
};

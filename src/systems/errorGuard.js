// src/systems/errorGuard.js

let initialized = false;
let shuttingDown = false;
const shutdownHooks = [];
const HOOK_TIMEOUT_MS = 5000;

function onShutdown(fn) {
  if (typeof fn === 'function') shutdownHooks.push(fn);
}

function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => setTimeout(resolve, ms).unref?.())
  ]);
}

module.exports = () => {
  if (initialized) return;
  initialized = true;

  // Lazy require para evitar ciclos
  const mongoose = require('../database/connect');

  // ==========================
  // Unhandled Promise Rejection
  // ==========================
  process.on('unhandledRejection', (reason) => {
    console.error('🚨 [UNHANDLED REJECTION]');
    console.error('Reason:', reason);

    if (reason instanceof Error) {
      console.error('Stack:', reason.stack);
    }
  });

  // ==========================
  // Uncaught Exception
  // ==========================
  process.on('uncaughtException', (err) => {
    console.error('🔥 [UNCAUGHT EXCEPTION]');
    console.error(err && err.stack ? err.stack : err);

    // After an uncaught exception the process state is undefined (Node docs):
    // shut down cleanly and let the platform restart the container.
    shutdown('uncaughtException', 1);
  });

  // ==========================
  // Warnings
  // ==========================
  process.on('warning', (warning) => {
    // Silence noisy discord.js v15 migration warnings...
    try {
      if (warning && warning.name === 'DeprecationWarning' && typeof warning.message === 'string' && warning.message.includes('ready event has been renamed to clientReady')) {
        return;
      }
    } catch {}
    console.warn('⚠️ [NODE WARNING]');
    console.warn(`${warning.name}: ${warning.message}`);

    if (warning.stack) {
      console.warn(warning.stack);
    }
  });

  // ==========================
  // Process signals (graceful)
  // ==========================
  const shutdown = async (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`🛑 Received ${signal}. Shutting down gracefully...`);

    for (const hook of shutdownHooks) {
      try {
        await withTimeout(hook(), HOOK_TIMEOUT_MS);
      } catch (err) {
        console.error('Error in shutdown hook:', err);
      }
    }

    try {
      if (mongoose && typeof mongoose.closeMongo === 'function') {
        await mongoose.closeMongo();
      }
    } catch (err) {
      console.error('Error while closing MongoDB during shutdown:', err);
    }

    // Pequeno delay para drenar logs / requests pendentes
    setTimeout(() => {
      process.exit(exitCode);
    }, 1000).unref?.();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('🛡️ ErrorGuard initialized');
};

module.exports.onShutdown = onShutdown;

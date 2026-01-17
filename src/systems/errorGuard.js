// src/systems/errorGuard.js

let initialized = false;

module.exports = () => {
  if (initialized) return;
  initialized = true;

  // ==========================
  // Unhandled Promise Rejection
  // ==========================
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 [UNHANDLED REJECTION]');
    console.error('Reason:', reason);

    if (reason instanceof Error) {
      console.error(reason.stack);
    }
  });

  // ==========================
  // Uncaught Exception
  // ==========================
  process.on('uncaughtException', (err) => {
    console.error('🔥 [UNCAUGHT EXCEPTION]');
    console.error(err.stack || err);

    /**
     * ⚠️ IMPORTANTE:
     * Não damos process.exit() aqui.
     * Em produção, Railway/PM2 deve decidir reiniciar.
     * Assim evitamos downtime desnecessário.
     */
  });

  // ==========================
  // Node.js Warnings
  // ==========================
  process.on('warning', (warning) => {
    console.warn('⚠️ [NODE WARNING]');
    console.warn(`${warning.name}: ${warning.message}`);

    if (warning.stack) {
      console.warn(warning.stack);
    }
  });

  // ==========================
  // Process signals (graceful)
  // ==========================
  const shutdown = (signal) => {
    console.log(`🛑 Received ${signal}. Shutting down gracefully...`);

    // Aqui futuramente podes:
    // - fechar Mongo
    // - parar jobs
    // - notificar dashboard

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('🛡️ ErrorGuard initialized');
};

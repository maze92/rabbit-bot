// src/systems/errorGuard.js

let initialized = false;

module.exports = () => {
  if (initialized) return;
  initialized = true;

  process.on('unhandledRejection', (reason) => {
    console.error('🚨 [UNHANDLED REJECTION]', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('🔥 [UNCAUGHT EXCEPTION]', err);
  });

  process.on('warning', (warning) => {
    console.warn('⚠️ [NODE WARNING]', warning.name, warning.message);
    if (warning.stack) console.warn(warning.stack);
  });

  console.log('🛡️ ErrorGuard initialized');
};

// src/systems/errorGuard.js
//
// Minimal error guard: attaches a basic listener for uncaught exceptions
// and unhandled rejections, logging them to the console. This keeps the
// process from crashing silently but does not attempt complex recovery.

module.exports = function initErrorGuard() {
  process.on('uncaughtException', (err) => {
    try {
      console.error('🔥 [UNCAUGHT EXCEPTION]', err);
    } catch {
      // swallow
    }
  });

  process.on('unhandledRejection', (reason) => {
    try {
      console.error('🔥 [UNHANDLED REJECTION]', reason);
    } catch {
      // swallow
    }
  });
};

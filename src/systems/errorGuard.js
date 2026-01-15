// src/systems/errorGuard.js
// ============================================================
// Error Guard / Global Error Handler
// 
// Protege o processo Node.js contra:
// - unhandledRejection (Promise rejeitada sem catch)
// - uncaughtException (erro fatal fora do fluxo normal)
// - warnings do Node (memory leaks, deprecated APIs, etc.)
//
// IMPORTANTE:
// - NÃO tenta "corrigir" erros
// - Apenas loga corretamente
// - Em produção (Railway/PM2), o process manager deve reiniciar o bot
// ============================================================

let initialized = false;

module.exports = () => {
  // Evita registar listeners duplicados
  if (initialized) return;
  initialized = true;

  // ------------------------------------------------------------
  // Promises rejeitadas sem catch
  // ------------------------------------------------------------
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 [UNHANDLED REJECTION]');
    console.error('Reason:', reason);

    // Em produção, NÃO damos process.exit aqui
    // PM2/Railway decide se deve reiniciar
  });

  // ------------------------------------------------------------
  // Erros fatais (normalmente crasham a app)
  // ------------------------------------------------------------
  process.on('uncaughtException', (err) => {
    console.error('🔥 [UNCAUGHT EXCEPTION]');
    console.error(err);

    // ⚠️ NOTA:
    // Aqui PODERIAS fazer process.exit(1)
    // MAS em Railway/PM2 é melhor deixar o manager decidir
    //
    // Se um dia quiseres forçar:
    // process.exit(1);
  });

  // ------------------------------------------------------------
  // Warnings do Node.js
  // (ex: MaxListenersExceededWarning)
  // ------------------------------------------------------------
  process.on('warning', (warning) => {
    console.warn('⚠️ [NODE WARNING]');
    console.warn('Name:', warning.name);
    console.warn('Message:', warning.message);

    if (warning.stack) {
      console.warn(warning.stack);
    }
  });

  console.log('🛡️ ErrorGuard initialized');
};

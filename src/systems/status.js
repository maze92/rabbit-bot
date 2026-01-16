// src/systems/status.js
// ============================================================
// Status global do bot (saúde do sistema)
// ------------------------------------------------------------
// Este módulo guarda flags simples sobre o estado atual:
// - discordReady: se o cliente do Discord já emitiu "ready"
// - mongoConnected: se a DB foi ligada com sucesso
// - gameNewsRunning: se o sistema de GameNews está ativo
// - startedAt: timestamp do arranque do processo
//
// É usado principalmente pelo endpoint /health no dashboard.
// Outros módulos podem atualizar estes valores via setters.
// ============================================================

const status = {
  discordReady: false,
  mongoConnected: false,
  gameNewsRunning: false,
  startedAt: Date.now()
};

/**
 * Get completo (usado pelo /health)
 */
function getStatus() {
  return { ...status };
}

/**
 * Marcar se o Discord está pronto (evento ready)
 */
function setDiscordReady(value = true) {
  status.discordReady = Boolean(value);
}

/**
 * Marcar se o MongoDB está ligado
 * (podes chamar isto no teu módulo de conexão à DB)
 */
function setMongoConnected(value = true) {
  status.mongoConnected = Boolean(value);
}

/**
 * Marcar se o sistema de GameNews está a correr
 */
function setGameNewsRunning(value = true) {
  status.gameNewsRunning = Boolean(value);
}

module.exports = {
  getStatus,
  setDiscordReady,
  setMongoConnected,
  setGameNewsRunning
};

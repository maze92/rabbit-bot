// src/systems/status.js

const status = {
  discordReady: false,
  mongoConnected: false,
  gameNewsRunning: false,

  startedAt: Date.now(),
  lastDiscordReadyAt: null,
  lastMongoConnectedAt: null,
  lastGameNewsStartedAt: null
};

function getStatus() {
  const now = Date.now();

  return {
    ok: status.discordReady && status.mongoConnected,

    discordReady: status.discordReady,
    mongoConnected: status.mongoConnected,
    gameNewsRunning: status.gameNewsRunning,

    uptimeSeconds: Math.floor((now - status.startedAt) / 1000),

    startedAt: new Date(status.startedAt).toISOString(),
    lastDiscordReadyAt: status.lastDiscordReadyAt,
    lastMongoConnectedAt: status.lastMongoConnectedAt,
    lastGameNewsStartedAt: status.lastGameNewsStartedAt
  };
}

function setDiscordReady(value = true) {
  status.discordReady = Boolean(value);
  if (value) status.lastDiscordReadyAt = new Date().toISOString();
}

function setMongoConnected(value = true) {
  status.mongoConnected = Boolean(value);
  if (value) status.lastMongoConnectedAt = new Date().toISOString();
}

function setGameNewsRunning(value = true) {
  status.gameNewsRunning = Boolean(value);
  if (value) status.lastGameNewsStartedAt = new Date().toISOString();
}

module.exports = {
  getStatus,
  setDiscordReady,
  setMongoConnected,
  setGameNewsRunning
};

// src/systems/status.js

const status = {
  discordReady: false,
  mongoConnected: false,
  gameNewsRunning: false,
  startedAt: Date.now()
};

function getStatus() {
  return { ...status };
}

function setDiscordReady(value = true) {
  status.discordReady = Boolean(value);
}

function setMongoConnected(value = true) {
  status.mongoConnected = Boolean(value);
}

function setGameNewsRunning(value = true) {
  status.gameNewsRunning = Boolean(value);
}

module.exports = {
  getStatus,
  setDiscordReady,
  setMongoConnected,
  setGameNewsRunning
};

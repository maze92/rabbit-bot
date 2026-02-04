'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

let botClient = null;

// Called from index.js once the Discord client is available
function setClient(client) {
  botClient = client;
}

// Initialize middleware, static files and basic API routes used by the frontend
function initializeDashboard() {
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const publicDir = path.join(__dirname, '../public');

  // Explicit root handler to avoid any ambiguity
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Serve all static assets (JS, CSS, etc.) from public/
  app.use(express.static(publicDir));

  // Health endpoint used by the status badge in the UI
  app.get('/health', (req, res) => {
    const discordReady =
      !!(botClient && typeof botClient.isReady === 'function' && botClient.isReady());

    res.json({
      ok: true,
      discordReady
    });
  });

  // List guilds for the server selector in the UI
  app.get('/api/guilds', (req, res) => {
    if (!botClient) {
      return res
        .status(503)
        .json({ ok: false, error: 'Bot client not ready' });
    }

    const items = botClient.guilds.cache.map(g => ({
      id: g.id,
      name: g.name
    }));

    res.json({ ok: true, items });
  });

  // Simple overview: number of guilds and users
  app.get('/api/overview', (req, res) => {
    if (!botClient) {
      return res.json({
        ok: true,
        guilds: 0,
        users: 0,
        actions24h: 0
      });
    }

    const guilds = botClient.guilds.cache.size;
    let users = 0;

    botClient.guilds.cache.forEach(g => {
      users += g.memberCount || 0;
    });

    res.json({
      ok: true,
      guilds,
      users,
      actions24h: 0
    });
  });

  return server;
}

// No-op admin bootstrap to keep compatibility
async function ensureDefaultDashboardAdmin() {
  return;
}

// Used by subsystems (e.g. GameNews) to emit real-time events to the dashboard
function sendToDashboard(event, payload) {
  try {
    io.emit(event, payload);
  } catch (err) {
    console.error('[Dashboard] sendToDashboard error', err);
  }
}

module.exports = {
  app,
  server,
  io,
  initializeDashboard,
  setClient,
  ensureDefaultDashboardAdmin,
  sendToDashboard
};

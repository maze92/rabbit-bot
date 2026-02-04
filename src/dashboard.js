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

  // Meta of a specific guild for UI headers, etc.
  app.get('/api/guilds/:guildId/meta', (req, res) => {
    const { guildId } = req.params;

    if (!botClient) {
      return res
        .status(503)
        .json({ ok: false, error: 'Bot client not ready' });
    }

    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) {
      return res
        .status(404)
        .json({ ok: false, error: 'Guild not found' });
    }

    let iconUrl = null;
    try {
      if (typeof guild.iconURL === 'function') {
        iconUrl = guild.iconURL({ size: 128 });
      }
    } catch {
      iconUrl = null;
    }

    res.json({
      ok: true,
      guild: {
        id: guild.id,
        name: guild.name,
        iconUrl,
        memberCount: guild.memberCount ?? null
      }
    });
  });

  // Minimal tickets endpoint so the Tickets tab doesn't 404
  app.get('/api/tickets', (req, res) => {
    const guildId = req.query.guildId;

    if (!guildId) {
      return res
        .status(400)
        .json({ ok: false, error: 'guildId is required' });
    }

    // TODO: plug into a real TicketLog collection.
    // For now we return an empty list so the UI can render gracefully.
    res.json({
      ok: true,
      items: []
    });
  });



  // Guild configuration (stub)
  app.get('/api/guilds/:guildId/config', (req, res) => {
    const { guildId } = req.params;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // TODO: load real configuration from database.
    // For now return a minimal default structure so the UI can render.
    res.json({
      ok: true,
      guildId,
      config: {}
    });
  });

  app.post('/api/guilds/:guildId/config', (req, res) => {
    const { guildId } = req.params;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // TODO: validate and persist configuration.
    // For now we just echo the payload back.
    const payload = req.body || {};
    res.json({
      ok: true,
      guildId,
      saved: payload
    });
  });

  // Dashboard auth users (stub)
  app.get('/api/auth/users', (req, res) => {
    // TODO: return real dashboard user accounts.
    res.json({
      ok: true,
      items: []
    });
  });

  app.post('/api/auth/users', (req, res) => {
    const payload = req.body || {};
    // TODO: create/update dashboard users.
    res.json({
      ok: true,
      saved: payload
    });
  });

  // Temporary voice configuration (stub)
  app.get('/api/temp-voice/config', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // TODO: load real temp-voice configuration.
    res.json({
      ok: true,
      guildId,
      config: {}
    });
  });

  app.post('/api/temp-voice/config', (req, res) => {
    const payload = req.body || {};
    // TODO: validate and persist.
    res.json({
      ok: true,
      saved: payload
    });
  });

  app.get('/api/temp-voice/active', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // TODO: return real list of active temp voice channels.
    res.json({
      ok: true,
      guildId,
      rooms: []
    });
  });



  // -----------------------------
  // Users (stub)
  // -----------------------------
  app.get('/api/users', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // TODO: load real users from Discord cache + DB enrichment.
    res.json({
      ok: true,
      items: []
    });
  });

  app.get('/api/users/:userId', (req, res) => {
    const { userId } = req.params;
    const guildId = req.query.guildId;

    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    // TODO: load real user profile and stats.
    res.json({
      ok: true,
      user: {
        id: userId
      }
    });
  });

  // -----------------------------
  // Logs (stub)
  // -----------------------------
  app.get('/api/logs', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // Optional filters
    const { type, limit } = req.query;

    // TODO: load logs from database.
    res.json({
      ok: true,
      items: [],
      meta: {
        type: type || null,
        limit: limit ? Number(limit) : null
      }
    });
  });

  // -----------------------------
  // Cases (stub)
  // -----------------------------
  app.get('/api/cases', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // Optional filter by userId
    const { userId } = req.query;

    // TODO: load cases from database.
    res.json({
      ok: true,
      items: [],
      meta: {
        userId: userId || null
      }
    });
  });

  app.get('/api/cases/:caseId', (req, res) => {
    const { caseId } = req.params;

    if (!caseId) {
      return res.status(400).json({ ok: false, error: 'caseId is required' });
    }

    // TODO: load real case details.
    res.json({
      ok: true,
      case: {
        id: caseId
      }
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

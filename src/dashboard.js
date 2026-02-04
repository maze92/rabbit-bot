'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
let status = null;
try {
  status = require('./systems/status');
} catch (err) {
  // status module optional for /health
}


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

  // Root and static files
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(express.static(publicDir));

  // Health endpoint used by the status badge in the UI
  app.get('/health', (req, res) => {
    const discordReady =
      !!(botClient && typeof botClient.isReady === 'function' && botClient.isReady());

    let mongoConnected = undefined;
    let gameNewsRunning = undefined;

    try {
      if (status && typeof status.getMongoConnected === 'function') {
        mongoConnected = status.getMongoConnected();
      }
      if (status && typeof status.getGameNewsRunning === 'function') {
        gameNewsRunning = status.getGameNewsRunning();
      }
    } catch (err) {
      console.error('[Dashboard] Failed to read status flags', err);
    }

    res.json({
      ok: true,
      discordReady,
      mongoConnected,
      gameNewsRunning
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

    const payload = req.body || {};
    // TODO: validate and persist configuration.
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

  // GameNews status (stub)
  app.get('/api/gamenews-status', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // TODO: wire to real GameNews tracking data.
    res.json({
      ok: true,
      items: []
    });
  });

  // GameNews feeds (stub)
  app.get('/api/gamenews/feeds', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // TODO: load real feeds for this guild from database.
    res.json({
      ok: true,
      items: []
    });
  });

  // Moderation overview (stub)
  app.get('/api/mod/overview', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // TODO: compute real moderation stats for the given time range.
    res.json({
      ok: true,
      moderationCounts: {
        warn: 0,
        mute: 0,
        unmute: 0,
        kick: 0,
        ban: 0,
        other: 0
      }
    });
  });

  // Cases list and details (stub)
  app.get('/api/cases', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

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

  // Guild users listing
  app.get('/api/guilds/:guildId/users', async (req, res) => {
    const { guildId } = req.params;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }
    if (!botClient) {
      return res.status(503).json({ ok: false, error: 'Bot client not ready' });
    }

    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({
        ok: false, error: 'Guild not found' });
    }

    try {
      let members = guild.members.cache;

      // If cache is empty, try a one-off fetch to populate it.
      if (!members || members.size === 0) {
        try {
          members = await guild.members.fetch({ withPresences: false });
        } catch (fetchErr) {
          console.error('[Dashboard] Failed to fetch guild members', fetchErr);
          members = guild.members.cache;
        }
      }

      const items = Array.from(members.values()).map(m => {
        const roles = Array.from(m.roles.cache.values())
          .filter(r => r.id !== guild.id)
          .map(r => ({ id: r.id, name: r.name }));

        return {
          id: m.id,
          username: m.user && m.user.username,
          tag: m.user && m.user.tag,
          bot: !!(m.user && m.user.bot),
          roles
        };
      });

      res.json({ ok: true, items });
    } catch (err) {
      console.error('[Dashboard] Failed to read guild members', err);
      res.status(500).json({ ok: false, error: 'Failed to read guild members' });
    }
  });

  // Single user + DB info (stub)
  app.get('/api/user', (req, res) => {
    const guildId = req.query.guildId;
    const userId = req.query.userId;
    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }
    if (!botClient) {
      return res.status(503).json({ ok: false, error: 'Bot client not ready' });
    }

    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ ok: false, error: 'Guild not found' });
    }

    const member = guild.members.cache.get(userId);
    if (!member) {
      return res.status(404).json({ ok: false, error: 'User not found in guild' });
    }

    const roles = Array.from(member.roles.cache.values())
      .filter(r => r.id !== guild.id)
      .map(r => ({ id: r.id, name: r.name }));

    // TODO: load real DB info (trust, warnings, etc.). For now, provide a minimal stub.
    const db = {
      trust: undefined,
      trustLabel: '',
      warnings: 0
    };

    res.json({
      ok: true,
      guildId,
      userId,
      user: {
        id: member.id,
        username: member.user && member.user.username,
        tag: member.user && member.user.tag,
        bot: !!(member.user && member.user.bot),
        roles
      },
      db
    });
  });

  // User history (infractions, counts, tickets) - stub
  app.get('/api/guilds/:guildId/users/:userId/history', (req, res) => {
    const { guildId, userId } = req.params;
    if (!guildId || !userId) {
      return res.status(400).json({ ok: false, error: 'guildId and userId are required' });
    }

    // TODO: plug into infractions/tickets collections.
    res.json({
      ok: true,
      infractions: [],
      counts: {},
      tickets: []
    });
  });



  // Guild full config/meta combined (stub used by some frontend calls)
  app.get('/api/guilds/:guildId', (req, res) => {
    const { guildId } = req.params;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    if (!botClient) {
      return res.status(503).json({ ok: false, error: 'Bot client not ready' });
    }

    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ ok: false, error: 'Guild not found' });
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

  // Logs endpoint (stub)
  app.get('/api/logs', (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId) {
      return res.status(400).json({ ok: false, error: 'guildId is required' });
    }

    // Query params: type, limit, page, userId, action, etc.
    // For now we simply return an empty list with basic paging metadata.
    res.json({
      ok: true,
      items: [],
      page: 1,
      totalPages: 1,
      totalItems: 0
    });
  });

  // GameNews test endpoint (stub)
  app.post('/api/gamenews/test', (req, res) => {
    const guildId = req.body && req.body.guildId;
    const feedId = req.body && req.body.feedId;
    if (!guildId || !feedId) {
      return res.status(400).json({ ok: false, error: 'guildId and feedId are required' });
    }

    // TODO: actually trigger a test delivery for this feed.
    res.json({
      ok: true,
      guildId,
      feedId,
      delivered: false
    });
  });

  // Moderation actions (stubs)
  function moderationOk(req, res) {
    res.json({ ok: true });
  }

  app.post('/api/mod/warn', (req, res) => moderationOk(req, res));
  app.post('/api/mod/unmute', (req, res) => moderationOk(req, res));
  app.post('/api/mod/reset-trust', (req, res) => moderationOk(req, res));
  app.post('/api/mod/reset-history', (req, res) => moderationOk(req, res));
  app.post('/api/mod/remove-infraction', (req, res) => moderationOk(req, res));


  // Favicon stub to avoid 404 noise
  app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
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

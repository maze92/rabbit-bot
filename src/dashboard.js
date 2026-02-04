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

/**
 * Chamado a partir do index.js depois de o client do Discord estar pronto.
 */
function setClient(client) {
  botClient = client;
}

/**
 * Inicializa a dashboard:
 * - middleware base
 * - ficheiros estáticos (public/)
 * - endpoints mínimos usados pelo frontend no load
 */
function initializeDashboard() {
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Serve a pasta public (index.html, JS, CSS) na root "/"
  app.use(express.static(path.join(__dirname, '../public')));

  // Endpoint de health usado para o badge de status do bot
  app.get('/health', (req, res) => {
    const discordReady =
      !!(botClient && typeof botClient.isReady === 'function' && botClient.isReady());

    res.json({
      ok: true,
      discordReady
    });
  });

  // Lista de guilds para o selector de servidores na dashboard
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

  // Overview simples: nº de servidores e utilizadores
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

/**
 * Compatibilidade: nesta versão mínima não criamos admin default.
 */
async function ensureDefaultDashboardAdmin() {
  return;
}

/**
 * Usado pelo sistema de GameNews / outros para enviar eventos em tempo-real
 * para a dashboard via WebSocket. Mesmo que não uses ainda, evita warnings
 * de propriedade inexistente.
 */
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

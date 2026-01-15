// src/database/models/DashboardLog.js
const { Schema, model } = require('mongoose');

/**
 * Logs do dashboard (persistentes no MongoDB)
 * - Guardam eventos que já são enviados via logger()
 * - Servem para a dashboard carregar histórico após restart
 */
const dashboardLogSchema = new Schema(
  {
    title: { type: String, required: true },

    // user/executor são objetos simples (id/tag) para evitar problemas
    user: {
      id: { type: String, default: null },
      tag: { type: String, default: null }
    },

    executor: {
      id: { type: String, default: null },
      tag: { type: String, default: null }
    },

    description: { type: String, default: '' },

    guild: {
      id: { type: String, default: null },
      name: { type: String, default: null }
    },

    // ISO string
    time: { type: String, default: () => new Date().toISOString() }
  },
  { timestamps: true }
);

// Index para queries mais rápidas por guild e tempo
dashboardLogSchema.index({ 'guild.id': 1, createdAt: -1 });

module.exports = model('DashboardLog', dashboardLogSchema);

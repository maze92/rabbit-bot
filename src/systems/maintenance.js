// src/systems/maintenance.js

/**
 * Pequeno scheduler de manutenção para:
 * - limpar infrações muito antigas
 * - limpar logs antigos do dashboard
 *
 * Mantém a base de dados mais leve ao longo do tempo.
 */

const Infraction = require('../database/models/Infraction');
let DashboardLog = null;

try {
  DashboardLog = require('../database/models/DashboardLog');
} catch {
  // opcional
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function runOnce(config) {
  const maintCfg = config.maintenance || {};
  const now = Date.now();

  const infDays = Number(maintCfg.pruneInfractionsOlderThanDays ?? 180);
  if (Number.isFinite(infDays) && infDays > 0) {
    const cutoff = new Date(now - infDays * DAY_MS);
    try {
      const res = await Infraction.deleteMany({ createdAt: { $lt: cutoff } });
      if (res?.deletedCount) {
        console.log(
          `[Maintenance] Removed ${res.deletedCount} old infractions (older than ${infDays}d).`
        );
      }
    } catch (err) {
      console.error('[Maintenance] Failed to prune infractions:', err);
    }
  }

  const logDays = Number(maintCfg.pruneDashboardLogsOlderThanDays ?? 60);
  if (DashboardLog && Number.isFinite(logDays) && logDays > 0) {
    const cutoff = new Date(now - logDays * DAY_MS);
    try {
      const res = await DashboardLog.deleteMany({ createdAt: { $lt: cutoff } });
      if (res?.deletedCount) {
        console.log(
          `[Maintenance] Removed ${res.deletedCount} old dashboard logs (older than ${logDays}d).`
        );
      }
    } catch (err) {
      console.error('[Maintenance] Failed to prune dashboard logs:', err);
    }
  }
}

function startMaintenance(config) {
  const maintCfg = config.maintenance || {};
  if (maintCfg.enabled === false) {
    console.log('[Maintenance] Disabled in config.maintenance.enabled');
    return;
  }

  const intervalMs = Number(maintCfg.intervalMs ?? 6 * 60 * 60 * 1000);
  const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 5 * 60 * 1000
    ? intervalMs
    : 6 * 60 * 60 * 1000;

  console.log(`[Maintenance] Scheduler running every ${Math.round(safeInterval / 60000)} minutes.`);

  // run once on startup (without blocking)
  runOnce(config).catch(() => null);

  setInterval(() => {
    runOnce(config).catch(() => null);
  }, safeInterval).unref?.();
}

module.exports = { startMaintenance, runOnce };

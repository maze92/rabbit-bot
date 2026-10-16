// src/systems/serverStats.js
//
// Estatísticas do servidor em canais de voz colocados no topo (acima das
// categorias, porque não têm categoria associada):
//   👥 Membros: N | 📥 Entradas (7d): N | 📤 Saídas (7d): N
//
// Os canais são criados na primeira utilização e o respetivo ID é persistido
// em GuildConfig.features.serverStats para ser reaproveitado nas atualizações.

const { ChannelType, PermissionsBitField } = require('discord.js');
const { getFeature } = require('./featuresService');
const { invalidateGuildConfig } = require('./guildConfigService');
const { getRecentCounts } = require('./memberStats');

// A API do Discord limita renomeações de canais; 6 minutos é seguro e suficiente.
const REFRESH_MS = 6 * 60 * 1000;

function applyTemplate(text, count) {
  return String(text == null ? '' : text).replace(/\{count\}/gi, String(count));
}

async function resolveChannel(guild, channelId) {
  if (!channelId) return null;
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  return guild.channels.fetch(channelId).catch(() => null);
}

async function ensureChannel(guild, channelId, name, position) {
  const desired = String(name || '').slice(0, 100) || '—';
  let channel = await resolveChannel(guild, channelId);

  if (!channel) {
    channel = await guild.channels.create({
      name: desired,
      type: ChannelType.GuildVoice,
      position,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.Connect]
        }
      ]
    }).catch(() => null);
    return channel;
  }

  if (channel.name !== desired) {
    await channel.setName(desired).catch(() => null);
  }
  if (typeof channel.setPosition === 'function' && channel.position !== position) {
    await channel.setPosition(position).catch(() => null);
  }
  return channel;
}

/**
 * Cria/atualiza os canais de estatísticas de um servidor.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {{force?: boolean}} [opts] force = ignora o interruptor (usado no teste)
 */
async function refreshGuild(client, guild, opts) {
  if (!guild) return { ok: false, error: 'GUILD_NOT_FOUND' };

  const force = !!(opts && opts.force);
  const cfg = await getFeature(guild.id, 'serverStats');
  if (!force && cfg.enabled !== true) return { ok: true, skipped: true };

  const members = guild.memberCount || 0;
  const { joins, leaves } = await getRecentCounts(guild.id, 7);

  const memberName = applyTemplate(cfg.memberTemplate, members);
  const joinsName = applyTemplate(cfg.joinsTemplate, joins);
  const leavesName = applyTemplate(cfg.leavesTemplate, leaves);

  const chMembers = await ensureChannel(guild, cfg.memberChannelId, memberName, 0);
  const chJoins = await ensureChannel(guild, cfg.joinsChannelId, joinsName, 1);
  const chLeaves = await ensureChannel(guild, cfg.leavesChannelId, leavesName, 2);

  const patch = {};
  if (chMembers && chMembers.id !== cfg.memberChannelId) patch['features.serverStats.memberChannelId'] = chMembers.id;
  if (chJoins && chJoins.id !== cfg.joinsChannelId) patch['features.serverStats.joinsChannelId'] = chJoins.id;
  if (chLeaves && chLeaves.id !== cfg.leavesChannelId) patch['features.serverStats.leavesChannelId'] = chLeaves.id;

  if (Object.keys(patch).length) {
    try {
      const GuildConfig = require('../database/models/GuildConfig');
      await GuildConfig.updateOne({ guildId: guild.id }, { $set: patch });
      invalidateGuildConfig(guild.id);
    } catch (err) {
      console.warn('[serverStats] Falha ao persistir IDs dos canais:', err?.message || err);
    }
  }

  return { ok: true, members, joins, leaves };
}

/**
 * Remove os canais de estatísticas (usado quando a funcionalidade é desligada)
 * e limpa os IDs guardados na configuração.
 */
async function removeGuild(guild, cfg) {
  if (!guild) return;
  const config = cfg || {};
  const ids = [config.memberChannelId, config.joinsChannelId, config.leavesChannelId].filter(Boolean);
  if (!ids.length) return;

  for (const id of ids) {
    const channel = await resolveChannel(guild, id);
    if (channel && typeof channel.delete === 'function') {
      await channel.delete().catch(() => null);
    }
  }

  try {
    const GuildConfig = require('../database/models/GuildConfig');
    await GuildConfig.updateOne(
      { guildId: guild.id },
      {
        $set: {
          'features.serverStats.memberChannelId': null,
          'features.serverStats.joinsChannelId': null,
          'features.serverStats.leavesChannelId': null
        }
      }
    );
    invalidateGuildConfig(guild.id);
  } catch (err) {
    console.warn('[serverStats] Falha ao limpar IDs dos canais:', err?.message || err);
  }
}

async function refreshAll(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await refreshGuild(client, guild);
    } catch (err) {
      console.warn(`[serverStats] Falha ao atualizar "${guild.name}":`, err?.message || err);
    }
  }
}

function startServerStats(client) {
  const run = () => refreshAll(client).catch(() => null);

  const initial = setTimeout(run, 15 * 1000);
  if (typeof initial.unref === 'function') initial.unref();

  const timer = setInterval(run, REFRESH_MS);
  if (typeof timer.unref === 'function') timer.unref();

  return { client, refreshGuild, refreshAll: run };
}

module.exports = { startServerStats, refreshGuild, removeGuild };

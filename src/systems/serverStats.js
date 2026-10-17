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
const { getFeatureText, applyTemplate } = require('./featureText');

// A API do Discord limita renomeações de canais; 6 minutos é seguro e suficiente.
const REFRESH_MS = 6 * 60 * 1000;

// Permissões negadas ao @everyone: o canal é um mostrador de números, não um
// canal utilizável. Sem negar `Connect` (e companhia) basta um clique para
// entrar no canal e ficar ligado a um "canal" que só serve para mostrar texto.
// Nota: quem tem `Administrator` ignora sempre as permissões de canal — essa é
// uma regra do Discord que não pode ser contrariada por overwrites.
const LOCKED_FLAGS = [
  PermissionsBitField.Flags.Connect,
  PermissionsBitField.Flags.Speak,
  PermissionsBitField.Flags.Stream,
  PermissionsBitField.Flags.UseVAD,
  PermissionsBitField.Flags.UseEmbeddedActivities,
  PermissionsBitField.Flags.UseSoundboard,
  PermissionsBitField.Flags.CreateInstantInvite
].filter(Boolean);

// Payload aceite por `permissionOverwrites.edit()` (nomes de permissão → false).
function lockEditPayload() {
  const payload = {};
  for (const flag of LOCKED_FLAGS) payload[flag] = false;
  return payload;
}

async function resolveChannel(guild, channelId) {
  if (!channelId) return null;
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  return guild.channels.fetch(channelId).catch(() => null);
}

/**
 * Reaplica o bloqueio de permissões a um canal já existente. Necessário para
 * canais criados antes deste bloqueio (que só negavam `Connect`) e para quando
 * alguém altera as permissões à mão no Discord.
 */
async function applyLock(channel, guild) {
  const everyone = guild.roles && guild.roles.everyone;
  if (!channel || !everyone) return;
  if (!channel.permissionOverwrites || typeof channel.permissionOverwrites.edit !== 'function') return;
  await channel.permissionOverwrites.edit(everyone, lockEditPayload()).catch(() => null);
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
          deny: LOCKED_FLAGS
        }
      ]
    }).catch(() => null);
    return channel;
  }

  // Só escreve se faltar alguma permissão por negar (evita chamadas à API
  // desnecessárias a cada ciclo de atualização).
  const overwrite = channel.permissionOverwrites && channel.permissionOverwrites.cache
    ? channel.permissionOverwrites.cache.get(guild.roles.everyone.id)
    : null;
  const missing = LOCKED_FLAGS.filter((flag) => !overwrite || !overwrite.deny.has(flag));
  if (missing.length) await applyLock(channel, guild);

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

  const memberName = applyTemplate(
    await getFeatureText({ guildId: guild.id, feature: 'serverStats', field: 'memberTemplate', value: cfg.memberTemplate }),
    { count: members }
  );
  const joinsName = applyTemplate(
    await getFeatureText({ guildId: guild.id, feature: 'serverStats', field: 'joinsTemplate', value: cfg.joinsTemplate }),
    { count: joins }
  );
  const leavesName = applyTemplate(
    await getFeatureText({ guildId: guild.id, feature: 'serverStats', field: 'leavesTemplate', value: cfg.leavesTemplate }),
    { count: leaves }
  );

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

  // Os IDs podem não vir no payload (ex.: a dashboard reenvia null ao desligar).
  // Nesse caso leem-se da base de dados para garantir que os canais são apagados.
  let stored = {};
  try {
    const GuildConfig = require('../database/models/GuildConfig');
    const doc = await GuildConfig.findOne({ guildId: guild.id }).lean();
    stored = (doc && doc.features && doc.features.serverStats) || {};
  } catch (err) {
    console.warn('[serverStats] Falha ao ler os IDs dos canais:', err?.message || err);
  }

  const ids = [
    config.memberChannelId || stored.memberChannelId,
    config.joinsChannelId || stored.joinsChannelId,
    config.leavesChannelId || stored.leavesChannelId
  ].filter(Boolean);
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

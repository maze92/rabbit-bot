// src/events/voiceStateUpdate.tempVoice.js
//
// Lógica de voz temporária:
// - Quando um utilizador entra num canal de voz configurado como "base", cria um canal temporário
//   com nome tipo "voice-<n>-<username>" ou semelhante, move o utilizador para lá e regista em DB.
// - Quando um canal temporário fica vazio, agenda a eliminação após X segundos (config).
//   Se alguém voltar a entrar antes do tempo, cancela a eliminação.
//

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const GuildConfig = require('../database/models/GuildConfig');
const TempVoiceChannel = require('../database/models/TempVoiceChannel');

const pendingDeletes = new Map(); // key: channelId, value: timeoutId
const creationLocks = new Set(); // userIds currently creating a temp voice channel

function normalizeDelaySeconds(raw) {
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 2) n = 10;
  if (n > 600) n = 600;
  return n;
}

async function handleJoin(client, newState, cfg) {
  const guild = newState.guild;
    if (!guild) return;

    const userId = newState.id;
    if (creationLocks.has(userId)) return;
    creationLocks.add(userId);

    try {
  const guild = newState.guild;
    if (!guild) return;

    const user = await guild.members.fetch(newState.id).catch(() => null);
    if (!user || user.user.bot) return;

    const baseId = newState.channelId;
    const baseChannel = guild.channels.cache.get(baseId);
    if (!baseChannel || baseChannel.type !== ChannelType.GuildVoice) return;

    // Verifica se este canal é um dos canais base
    const baseIds = Array.isArray(cfg.baseChannelIds) ? cfg.baseChannelIds : [];
    if (!baseIds.includes(baseId)) return;

    // Verifica se já existe canal temporário para este utilizador nesta guild
    const existing = await TempVoiceChannel.findOne({ guildId: guild.id, ownerId: user.id }).lean();
    if (existing) {
      // Se o canal ainda existir, move o user para lá
      const ch = guild.channels.cache.get(existing.channelId);
      if (ch && ch.type === ChannelType.GuildVoice) {
        await newState.setChannel(ch).catch(() => {});
        return;
      }
    }

    // Limite máximo de utilizadores por sala (se definido)
    const maxUsersPerRoom = typeof cfg.maxUsersPerRoom === 'number' ? cfg.maxUsersPerRoom : null;

    // Definir categoria onde criar
    let parentId = cfg.categoryId || null;
    if (parentId) {
      const parent = guild.channels.cache.get(parentId);
      if (!parent || parent.type !== ChannelType.GuildCategory) {
        parentId = null;
      }
    }

    // Nome do canal temporário
    const baseName = 'channel';
    let seq = 1;
    try {
      const existingChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildVoice && c.name.startsWith(baseName + '-')
      );
      if (existingChannels.size > 0) {
        const nums = [];
        for (const ch of existingChannels.values()) {
          const parts = ch.name.split('-');
          if (parts.length >= 2) {
            const maybeNum = parseInt(parts[1], 10);
            if (Number.isFinite(maybeNum)) nums.push(maybeNum);
          }
        }
        if (nums.length) {
          seq = Math.max(...nums) + 1;
        }
      }
    } catch {
      // ignore
    }

    const channelName = `${baseName}-${seq}`;

    // Permissões: o owner pode gerenciar a sala, etc.
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        allow: [],
        deny: []
      },
      {
        id: user.id,
        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers],
        deny: []
      }
    ];

    const created = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: parentId || undefined,
      userLimit: maxUsersPerRoom || undefined,
      permissionOverwrites
    }).catch(() => null);

    if (!created) return;

    // Registar na DB
    await TempVoiceChannel.create({
      guildId: guild.id,
      channelId: created.id,
      ownerId: user.id,
      baseChannelId: baseId
    }).catch(() => {});

    // Mover user
    await newState.setChannel(created).catch(() => {});

    // Se havia timer de delete para este canal (não devia, mas por via das dúvidas), limpa
    const timeoutId = pendingDeletes.get(created.id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingDeletes.delete(created.id);
    }
    } finally {
      creationLocks.delete(userId);
    }
}

async function scheduleDeleteChannel(channel, delaySeconds) {
  if (!channel) return;

  // Se já houver timer, limpa
  const existing = pendingDeletes.get(channel.id);
  if (existing) {
    clearTimeout(existing);
  }

  const timeoutId = setTimeout(async () => {
    try {
      if (channel.deleted) return;
      if (channel.members && channel.members.size > 0) return;

      await TempVoiceChannel.deleteOne({ guildId: channel.guild.id, channelId: channel.id }).catch(() => {});
      await channel.delete('Temporary voice channel empty (auto-clean)').catch(() => {});
    } finally {
      pendingDeletes.delete(channel.id);
    }
  }, delaySeconds * 1000);

  pendingDeletes.set(channel.id, timeoutId);
}

async function handleLeave(oldState, cfg) {
  const guild = oldState.guild;
  if (!guild) return;

  const channelId = oldState.channelId;
  if (!channelId) return;

  const ch = guild.channels.cache.get(channelId);
  if (!ch || ch.type !== ChannelType.GuildVoice) return;

  // Verifica se este canal é um temp voice registado
  const doc = await TempVoiceChannel.findOne({ guildId: guild.id, channelId }).lean();
  if (!doc) return;

  // Se ainda houver membros, não apaga
  if (ch.members && ch.members.size > 0) return;

  const delaySeconds = normalizeDelaySeconds(cfg.deleteDelaySeconds);
  await scheduleDeleteChannel(ch, delaySeconds);
}

module.exports = (client) => {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      // Ignora DMs / sem guild
      if (!newState.guild && !oldState.guild) return;

      const guild = newState.guild || oldState.guild;
      if (!guild) return;

      const cfg = await GuildConfig.findOne({ guildId: guild.id }).lean();
      const tv = cfg && cfg.tempVoice ? cfg.tempVoice : null;
      if (!tv || tv.enabled !== true) return;

      // User entrou num canal de voz (e não estava em nenhum antes)
      if (!oldState.channelId && newState.channelId) {
        await handleJoin(client, newState, tv);
        return;
      }

      // User mudou de canal
      if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // Se entrou num canal base, trata como join
        await handleJoin(client, newState, tv);
        // E também verifica se deixou um temp voice que ficou vazio
        await handleLeave(oldState, tv);
        return;
      }

      // User saiu de um canal (e não entrou em nenhum)
      if (oldState.channelId && !newState.channelId) {
        await handleLeave(oldState, tv);
        return;
      }
    } catch (err) {
      console.error('[TempVoice] voiceStateUpdate error:', err);
    }
  });
};

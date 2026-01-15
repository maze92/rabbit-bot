// src/systems/logger.js
// ============================================================
// Logger centralizado
// - Envia embed para o canal de logs no Discord
// - Envia log em tempo real para dashboard (e persist via dashboard.js)
// ============================================================

const { EmbedBuilder } = require('discord.js');
const config = require('../config/defaultConfig');
const dashboard = require('../dashboard');

/**
 * Normaliza User ou GuildMember em { id, tag }
 */
function normalizeActor(actor) {
  if (!actor) return null;

  const u = actor.user ?? actor;
  if (!u?.id) return null;

  return {
    id: u.id,
    tag: u.tag || `${u.username ?? 'Unknown'}#0000`
  };
}

/**
 * Resolve a guild com segurança
 */
function resolveGuild(guild, user, executor) {
  return guild || user?.guild || executor?.guild || null;
}

module.exports = async function logger(client, title, user, executor, description, guild) {
  try {
    const resolvedGuild = resolveGuild(guild, user, executor);
    if (!resolvedGuild) return;

    const logChannelName = config.logChannelName || 'log-bot';
    const logChannel = resolvedGuild.channels?.cache?.find(
      (ch) => ch?.name === logChannelName
    ) || null;

    const nUser = normalizeActor(user);
    const nExec = normalizeActor(executor);

    let desc = '';
    if (nUser?.tag) desc += `👤 **User:** ${nUser.tag}\n`;
    if (nExec?.tag) desc += `🛠️ **Executor:** ${nExec.tag}\n`;
    if (description) desc += `${description}`;

    const embed = new EmbedBuilder()
      .setTitle(title || 'Log')
      .setColor('Blue')
      .setDescription(desc || 'No description provided.')
      .setTimestamp(new Date());

    if (logChannel) {
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }

    // Dashboard (tempo real + persistência feita no dashboard.js)
    if (dashboard?.sendToDashboard) {
      dashboard.sendToDashboard('log', {
        title: title || 'Log',
        description: description || '',
        user: nUser,
        executor: nExec,
        guild: { id: resolvedGuild.id, name: resolvedGuild.name },
        time: new Date().toISOString()
      });
    }

  } catch (err) {
    console.error('[Logger] Error:', err);
  }
};

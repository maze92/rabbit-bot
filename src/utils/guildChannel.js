function isGuildChannel(channel, guildId) {
  const channelGuildId = channel && (channel.guildId || channel.guild?.id);
  return Boolean(
    channelGuildId && guildId && String(channelGuildId) === String(guildId),
  );
}

module.exports = { isGuildChannel };

// src/config/messages.js

module.exports = {
  en: {
    common: {
      noPermission: "❌ You don't have permission to use this command.",
      usage: (text) => `❌ Usage: ${text}`,
      unexpectedError: '❌ An unexpected error occurred.',
      noReason: 'No reason provided'
    },

    warn: {
      cannotWarnSelf: '❌ You cannot warn yourself.',
      cannotWarnBot: '❌ You cannot warn the bot.',
      hierarchyBot: '❌ I cannot warn this user due to role hierarchy (my role is not high enough).',
      hierarchyYou: '❌ You cannot warn a user with an equal or higher role than yours.',
      cannotWarnAdmin: '❌ You cannot warn an Administrator.',
      warnedPublic: ({ mention, warnings, reason }) =>
        `⚠️ ${mention} has been warned.\n📌 Total warnings: **${warnings}**\n📝 Reason: **${reason}**`,
      warnedDM: ({ guildName, warnings, reason }) =>
        `⚠️ You received a **WARN** in **${guildName}**.\n📝 Reason: **${reason}**\n📌 Total warnings: **${warnings}**`
    },

    mute: {
      cannotMuteSelf: '❌ You cannot mute yourself.',
      cannotMuteBot: '❌ You cannot mute the bot.',
      cannotMuteBots: '⚠️ You cannot mute a bot.',
      alreadyMuted: (tag) => `⚠️ **${tag}** is already muted.`,
      missingPerm: '❌ I do not have permission to timeout members (Moderate Members).',
      hierarchyBot: '❌ I cannot mute this user (their role is higher or equal to my highest role).',
      hierarchyYou: '❌ You cannot mute a user with an equal or higher role than yours.',
      cannotMuteAdmin: '❌ You cannot mute an Administrator.',
      tooLong: '❌ Timeout duration cannot exceed 28 days.',
      mutedPublic: ({ tag, duration, reason }) =>
        `🔇 **${tag}** has been muted for **${duration}**.\n📝 Reason: **${reason}**`,
      mutedDM: ({ guildName, duration, reason }) =>
        `🔇 You received a **manual MUTE** in **${guildName}**.\n⏰ Duration: **${duration}**\n📝 Reason: **${reason}**`,
      failedMute: '❌ Failed to mute the user. Check my permissions and role hierarchy.'
    },

    userinfo: {
      title: (tag) => `User Info - ${tag}`,
      recentInfractionsStaffOnly: 'Recent infraction details are **visible to staff only**.',
      noRecentInfractions: 'No recent infractions found.',
      trustDisabled: 'Trust system is currently **disabled**.',
      trustInternal: 'Trust Score is **internal** and only visible to staff.\nModeration decisions may be stricter for repeat offenders.',
      fields: {
        user: '👤 User',
        account: '📅 Account',
        warnings: '⚠️ Warnings',
        trust: '🔐 Trust Score',
        recent: (n) => `🧾 Recent infractions (last ${n})`,
        summary: 'Summary by type'
      }
    },

    automod: {
      warnReason: (word) => `Inappropriate language (detected: "${word}")`,
      warnLogReason: (word) => `AutoMod detected banned word: ${word}`,
      warnChannel: ({ mention, warnings, maxWarnings }) =>
        `⚠️ ${mention}, you received a **WARN**.\n📝 Reason: **Inappropriate language**\n📌 Warnings: **${warnings}**

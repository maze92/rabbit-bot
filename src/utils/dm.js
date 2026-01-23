// src/utils/dm.js

/**
 * Safely attempt to DM a user.
 * - Accepts either a string (content) or a Discord.js message payload.
 * - Never throws (DMs can fail if user has them closed).
 */
async function safeDM(user, contentOrPayload) {
  try {
    if (!user || !contentOrPayload) return;

    const payload =
      typeof contentOrPayload === 'string'
        ? { content: contentOrPayload }
        : contentOrPayload;

    await user.send(payload).catch(() => null);
  } catch {
    // ignore
  }
}

module.exports = { safeDM };

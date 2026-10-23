const { Readable } = require("stream");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  NoSubscriberBehavior,
  AudioPlayerStatus,
} = require("@discordjs/voice");

const playDl = (() => {
  try {
    return require("play-dl");
  } catch {
    return null;
  }
})();

const guildPlayers = new Map();
const guildQueues = new Map();

function normalizeMediaQuery(value) {
  return String(value == null ? "" : value).trim();
}

function isPlayableUrl(value) {
  const raw = normalizeMediaQuery(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isYoutubeUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "youtu.be" || hostname.endsWith("youtube.com");
  } catch {
    return false;
  }
}

function normalizePlaybackError(error) {
  const message = String(error?.message || "");
  if (/sign in to confirm|confirm you(?:'|’)re not a bot/i.test(message)) {
    return "SOURCE_BLOCKED";
  }
  return message || "PLAY_FAILED";
}

function releaseGuildSession(guildId, session, clearQueue = true) {
  if (session) {
    session.state = "stopped";
  }
  if (guildPlayers.get(guildId) !== session) return;
  guildPlayers.delete(guildId);
  if (clearQueue) guildQueues.delete(guildId);
  if (session.client && session.onVoiceStateUpdate) {
    session.client.off("voiceStateUpdate", session.onVoiceStateUpdate);
  }
  try {
    session.player?.stop(true);
  } catch {}
  try {
    session.connection?.destroy();
  } catch {}
}

async function resolveTrackSource(query) {
  const raw = normalizeMediaQuery(query);
  if (!raw) {
    throw new Error("EMPTY_QUERY");
  }

  if (isPlayableUrl(raw)) {
    return {
      url: raw,
      title: "Direct stream",
    };
  }

  if (!playDl || typeof playDl.search !== "function") {
    throw new Error("SEARCH_UNAVAILABLE");
  }

  const results = await playDl.search(raw, { limit: 1 });
  const first = Array.isArray(results) ? results[0] : null;
  if (!first || !first.url) {
    throw new Error("NO_RESULTS");
  }

  return {
    url: first.url,
    title: first.title || raw,
  };
}

async function createResourceFromUrl(url) {
  if (isYoutubeUrl(url)) {
    throw new Error("SOURCE_BLOCKED");
  }

  if (playDl && typeof playDl.stream === "function") {
    try {
      const data = await playDl.stream(url, {
        quality: 0,
        discordPlayerCompatibility: true,
      });
      const stream = data && (data.stream || data);
      if (stream) {
        return createAudioResource(stream, {
          inputType: StreamType.Arbitrary,
          inlineVolume: true,
        });
      }
    } catch (err) {
      console.warn("[music] play-dl stream failed, retrying raw HTTP stream:", err?.message || err);
      if (isYoutubeUrl(url)) throw new Error("SOURCE_BLOCKED");
    }
  }

  if (isYoutubeUrl(url)) throw new Error("SOURCE_BLOCKED");
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`STREAM_UNAVAILABLE:${response.status || "unknown"}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error("STREAM_NOT_AUDIO");
  }

  const nodeStream = Readable.fromWeb(response.body);
  return createAudioResource(nodeStream, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });
}

async function ensureGuildPlayer(client, guildId, channelId) {
  if (!client || !guildId || !channelId) {
    throw new Error("MISSING_CLIENT_OR_CHANNEL");
  }

  const guild =
    client.guilds?.cache?.get(guildId) ||
    (client.guilds && typeof client.guilds.fetch === "function"
      ? await client.guilds.fetch(guildId).catch(() => null)
      : null);

  if (!guild) {
    throw new Error("GUILD_NOT_FOUND");
  }

  const existing = guildPlayers.get(guildId);
  if (existing && existing.connection) {
    if (existing.connection.joinConfig?.channelId === channelId) {
      return existing;
    }
    releaseGuildSession(guildId, existing);
  }

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  connection.subscribe(player);

  const session = { guildId, channelId, connection, player, client, state: "idle" };
  guildPlayers.set(guildId, session);
  session.onVoiceStateUpdate = (oldState, newState) => {
    if (
      oldState?.channelId !== channelId &&
      newState?.channelId !== channelId
    ) {
      return;
    }
    const voiceChannel = guild.channels.cache.get(channelId);
    const hasListeners = voiceChannel?.members?.some(
      (member) => !member.user?.bot,
    );
    if (hasListeners === false) releaseGuildSession(guildId, session);
  };
  client.on("voiceStateUpdate", session.onVoiceStateUpdate);

  if (!session._queueBound) {
    session.player.on(AudioPlayerStatus.Idle, async () => {
      if (guildPlayers.get(guildId) !== session) return;
      session.state = "idle";
      const queue = getGuildQueue(guildId);
      if (queue.length > 0) {
        const next = queue[0];
        guildQueues.set(guildId, queue.slice(1));
        const sessionNow = guildPlayers.get(guildId);
        if (!sessionNow) return;
        try {
          const resource = await createResourceFromUrl(next.url);
          sessionNow.state = "playing";
          sessionNow.player.play(resource);
          sessionNow.lastTrack = { title: next.title, url: next.url };
        } catch {
          releaseGuildSession(guildId, sessionNow);
        }
      } else {
        releaseGuildSession(guildId, session);
      }
    });
    session._queueBound = true;
  }

  return session;
}

async function playGuildMusic({ client, guildId, channelId, query }) {
  const normalized = normalizeMediaQuery(query);
  if (!normalized) {
    return { ok: false, status: "error", reason: "EMPTY_QUERY" };
  }

  try {
    const source = await resolveTrackSource(normalized);
    const session = guildPlayers.get(guildId);
    const isActiveSession =
      !!session &&
      (
        (session.state && session.state !== "idle" && session.state !== "stopped") ||
        (session.player && session.player.state && session.player.state.status !== "idle")
      );

    if (isActiveSession) {
      const queued = enqueueGuildTrack(guildId, {
        title: source.title,
        url: source.url,
      });
      return {
        ok: queued.ok,
        status: queued.ok ? "queued" : "error",
        title: source.title,
        url: source.url,
        queueLength: queued.queueLength || getGuildQueue(guildId).length,
      };
    }

    const activeSession = await ensureGuildPlayer(client, guildId, channelId);
    const resource = await createResourceFromUrl(source.url);
    activeSession.state = "playing";
    activeSession.player.play(resource);
    activeSession.lastTrack = {
      title: source.title,
      url: source.url,
    };

    return {
      ok: true,
      status: "playing",
      title: source.title,
      url: source.url,
    };
  } catch (err) {
    const reason = normalizePlaybackError(err);
    return {
      ok: false,
      status: "error",
      reason,
    };
  }
}

function getGuildQueue(guildId) {
  const queue = guildQueues.get(guildId);
  return Array.isArray(queue) ? queue.slice() : [];
}

function enqueueGuildTrack(guildId, track) {
  if (!guildId || !track) {
    return { ok: false, status: "error", reason: "INVALID_TRACK" };
  }

  const title = String(track.title || track.url || "").trim();
  const url = String(track.url || track.title || "").trim();
  if (!title || !url) {
    return { ok: false, status: "error", reason: "INVALID_TRACK" };
  }

  const queue = getGuildQueue(guildId);
  const item = { title, url };
  queue.push(item);
  guildQueues.set(guildId, queue);

  return {
    ok: true,
    status: "queued",
    queueLength: queue.length,
    item,
  };
}

function getNowPlaying(guildId) {
  const session = guildPlayers.get(guildId);
  if (session?.lastTrack) {
    return session.lastTrack;
  }

  const queue = getGuildQueue(guildId);
  return queue[0] || null;
}

async function stopGuildMusic(guildId) {
  const session = guildPlayers.get(guildId);
  if (!session) {
    guildQueues.delete(guildId);
    return { ok: true, status: "stopped" };
  }

  releaseGuildSession(guildId, session);
  return { ok: true, status: "stopped" };
}

async function leaveGuildMusic(guildId) {
  return stopGuildMusic(guildId);
}

module.exports = {
  normalizeMediaQuery,
  isPlayableUrl,
  resolveTrackSource,
  playGuildMusic,
  stopGuildMusic,
  leaveGuildMusic,
  enqueueGuildTrack,
  getGuildQueue,
  getNowPlaying,
  guildPlayers,
  guildQueues,
  _internals: {
    releaseGuildSession,
    isYoutubeUrl,
    normalizePlaybackError,
    createResourceFromUrl,
  },
};

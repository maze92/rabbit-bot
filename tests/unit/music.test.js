const { test, ok } = require("./_harness");
const {
  normalizeMediaQuery,
  isPlayableUrl,
  enqueueGuildTrack,
  getGuildQueue,
  getNowPlaying,
  guildPlayers,
  playGuildMusic,
  stopGuildMusic,
  _internals,
} = require("../../src/systems/music");
const { t } = require("../../src/systems/i18n");

test("command strings follow the selected language and interpolate variables", async () => {
  const en = t("play.nowPlaying", "en", { title: "Night Drive", channel: "General" });
  const pt = t("play.nowPlaying", "pt", { title: "Night Drive", channel: "Geral" });
  ok(en.includes("Now playing") && en.includes("General"), "English play message should be localized");
  ok(pt.includes("A reproduzir") && pt.includes("Geral"), "Portuguese play message should be localized");
  ok(t("info.commands.warn", "en").includes("warning"), "English info text should load from the locale");
  ok(t("info.commands.warn", "pt").includes("aviso"), "Portuguese info text should load from the locale");
});

test("normalizeMediaQuery trims whitespace and preserves playable URLs", async () => {
  const normalized = normalizeMediaQuery("  https://example.com/song.mp3  ");
  ok(normalized === "https://example.com/song.mp3", "URLs should be preserved exactly once trimmed");
});

test("isPlayableUrl accepts direct audio URLs and rejects empty input", async () => {
  ok(isPlayableUrl("https://example.com/song.mp3") === true, "direct audio URLs should be accepted");
  ok(isPlayableUrl("   ") === false, "blank values should be rejected");
});

test("YouTube bot challenges are surfaced without treating the page as audio", async () => {
  ok(
    _internals.isYoutubeUrl("https://www.youtube.com/watch?v=example") === true,
    "YouTube URLs should be recognized before raw HTTP fallback",
  );
  ok(
    _internals.normalizePlaybackError(
      new Error("Sign in to confirm you're not a bot"),
    ) === "SOURCE_BLOCKED",
    "anti-bot failures should produce a stable playback reason",
  );
});

test("releasing a music session clears its queue and voice listener", async () => {
  const events = new Map();
  let destroyed = false;
  const session = {
    player: { stop: () => {} },
    connection: { destroy: () => { destroyed = true; } },
    client: {
      off: (name, listener) => events.delete(name + listener),
    },
    onVoiceStateUpdate: () => {},
    state: "playing",
  };
  events.set("voiceStateUpdate" + session.onVoiceStateUpdate, true);
  guildPlayers.set("guild-cleanup", session);
  enqueueGuildTrack("guild-cleanup", {
    title: "Queued",
    url: "https://example.com/audio.mp3",
  });

  _internals.releaseGuildSession("guild-cleanup", session);

  ok(!guildPlayers.has("guild-cleanup"), "session should be removed");
  ok(!getGuildQueue("guild-cleanup").length, "queue should be cleared");
  ok(session.state === "stopped", "session state should be explicit on cleanup");
  ok(!events.size && destroyed, "listener and voice connection should be released");
});

test("queue tracks and expose the current track", async () => {
  const queued = await enqueueGuildTrack("guild-2", { title: "First track", url: "https://example.com/first.mp3" });
  ok(queued.ok === true && queued.queueLength === 1, "enqueue should add a track to the guild queue");

  const second = await enqueueGuildTrack("guild-2", { title: "Second track", url: "https://example.com/second.mp3" });
  ok(second.ok === true && second.queueLength === 2, "the queue should grow with each track");

  const nowPlaying = getNowPlaying("guild-2");
  ok(nowPlaying && nowPlaying.title === "First track", "the first queued item should be the current track");

  const queue = getGuildQueue("guild-2");
  ok(Array.isArray(queue) && queue.length === 2, "queue access should return the guild queue");

  const stopped = await stopGuildMusic("guild-2");
  ok(stopped.ok === true && stopped.status === "stopped", "stop should clear the active tracked state");
});

test("new play requests queue behind the active track instead of replacing it", async () => {
  const fakeSession = {
    player: {
      stop: () => {},
      play: () => {},
      state: { status: "playing" },
    },
    connection: { destroy: () => {} },
    channelId: "channel-1",
    lastTrack: { title: "Current track", url: "https://example.com/current.mp3" },
  };

  guildPlayers.set("guild-3", fakeSession);

  const result = await playGuildMusic({
    client: { guilds: { cache: new Map(), fetch: async () => ({ voiceAdapterCreator: "adapter" }) } },
    guildId: "guild-3",
    channelId: "channel-1",
    query: "https://example.com/next.mp3",
  });

  ok(result.ok === true && result.status === "queued", "a second play request should queue instead of replace the active track");
  ok(getGuildQueue("guild-3").length === 1, "queued items should be kept in order for later playback");

  guildPlayers.delete("guild-3");
  await stopGuildMusic("guild-3");
});

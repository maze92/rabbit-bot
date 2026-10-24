const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const { registerUserRoutes } = require("../../src/dashboard/routes/user");
const trust = require("../../src/utils/trust");
const { startApp, stopApp, passthrough } = require("./_helpers");

const GUILD_ID = "111111111111111111";
const USER_ID = "222222222222222222";

test("user inspector predicts mute from current Trust-aware warnings", async () => {
  const trustConfig = {
    enabled: true,
    base: 50,
    min: 0,
    max: 100,
    lowThreshold: 25,
    highThreshold: 75,
    lowTrustWarningsPenalty: 1,
    lowTrustMuteMultiplier: 2,
    highTrustMuteMultiplier: 0.6,
  };
  const originalGetGuildTrustConfig = trust.getGuildTrustConfig;
  trust.getGuildTrustConfig = async () => trustConfig;

  const user = {
    id: USER_ID,
    tag: "test-user",
    username: "test-user",
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    displayAvatarURL: () => "https://example.test/avatar.png",
  };
  const member = {
    id: USER_ID,
    user,
    joinedAt: new Date("2021-01-01T00:00:00.000Z"),
    roles: { cache: { map: () => [] } },
  };
  const guild = {
    members: { fetch: async () => member },
  };
  const client = {
    guilds: { cache: { get: () => guild } },
  };
  const dbUser = {
    warnings: 1,
    trust: 10,
    trustHistory: [],
  };
  const app = await startApp(registerUserRoutes, {
    express,
    requireDashboardAuth: passthrough,
    requireGuildAccess: () => passthrough,
    getClient: () => client,
    warningsService: { getOrCreateUser: async () => dbUser },
    infractionsService: {
      getRecentInfractions: async () => [],
      countInfractionsByType: async () => ({ WARN: 8 }),
    },
    config: {
      maxWarnings: 3,
      automation: { autoMute: { enabled: true, muteDurationMs: 600_000 } },
    },
    getTrustLabel: () => "high risk",
    getEffectiveMuteDuration: (duration) => duration * 2,
  });

  try {
    const response = await fetch(
      `${app.baseUrl}/api/user?guildId=${GUILD_ID}&userId=${USER_ID}`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.counts.WARN, 8);
    assert.equal(body.db.warnings, 1);
    assert.deepEqual(body.db.nextPenalty, {
      automationEnabled: true,
      warnsCount: 1,
      warnsToMute: 2,
      remaining: 1,
      estimatedMuteMinutes: 20,
    });
  } finally {
    trust.getGuildTrustConfig = originalGetGuildTrustConfig;
    await stopApp(app.server);
  }
});

const { test, eq } = require("./_harness");
const {
  getAutoKickThreshold,
  buildAutoKickInfractionFilter,
  shouldCheckAutoKickImmediately,
  hasReachedAutoKickThreshold,
  isAutoKickEligible,
} = require("../../src/systems/autoKick");
const { PermissionsBitField } = require("discord.js");

function member({ position, kickable = true, permissions = [] }) {
  return {
    kickable,
    roles: { highest: { position } },
    permissions: { has: (flag) => permissions.includes(flag) },
  };
}

test("AutoKick requires KickMembers permission and a lower, kickable target", () => {
  const bot = member({
    position: 10,
    permissions: [PermissionsBitField.Flags.KickMembers],
  });
  eq(isAutoKickEligible(bot, member({ position: 5 })), true);
  eq(
    isAutoKickEligible(member({ position: 10 }), member({ position: 5 })),
    false,
  );
  eq(isAutoKickEligible(bot, member({ position: 10 })), false);
  eq(isAutoKickEligible(bot, member({ position: 5, kickable: false })), false);
});

test("AutoKick never targets server administrators", () => {
  const bot = member({
    position: 10,
    permissions: [PermissionsBitField.Flags.KickMembers],
  });
  const admin = member({
    position: 5,
    permissions: [PermissionsBitField.Flags.Administrator],
  });
  eq(isAutoKickEligible(bot, admin), false);
});

test("AutoKick threshold is explicit and requires an enabled feature", () => {
  eq(getAutoKickThreshold(5), 5);
  eq(getAutoKickThreshold(0), 1);
  eq(
    hasReachedAutoKickThreshold({ enabled: false, infractionsToKick: 2 }, 3),
    false,
  );
  eq(
    hasReachedAutoKickThreshold({ enabled: true, infractionsToKick: 2 }, 1),
    false,
  );
  eq(
    hasReachedAutoKickThreshold({ enabled: true, infractionsToKick: 2 }, 2),
    true,
  );
});

test("AutoKick counts follow-up automatic MUTE records only once", () => {
  const filter = buildAutoKickInfractionFilter("guild", "user");
  eq(filter.guildId, "guild");
  eq(filter.userId, "user");
  eq(filter.$or[0].type, "WARN");
  eq(filter.$or[1].type, "MUTE");
  eq(filter.$or[1].source.$nin.includes("automod"), true);
  eq(filter.$or[1].source.$nin.includes("automation"), true);
  eq(filter.$or[1].source.$nin.includes("slash-escalation"), true);
});

test("AutoKick waits for AutoMod to finish its WARN/MUTE sequence", () => {
  eq(shouldCheckAutoKickImmediately("WARN", "automod"), false);
  eq(shouldCheckAutoKickImmediately("MUTE", "automod"), false);
  eq(shouldCheckAutoKickImmediately("WARN", "slash"), false);
  eq(shouldCheckAutoKickImmediately("WARN", "antispam"), false);
  eq(shouldCheckAutoKickImmediately("MUTE", "antispam"), false);
  eq(shouldCheckAutoKickImmediately("KICK", "slash"), false);
});

test("AutoKick waits for manual WARN automation but not independent MUTE", () => {
  eq(shouldCheckAutoKickImmediately("WARN", "dashboard"), false);
  eq(shouldCheckAutoKickImmediately("MUTE", "dashboard"), true);
  eq(shouldCheckAutoKickImmediately("MUTE", "automation"), false);
  eq(shouldCheckAutoKickImmediately("MUTE", "slash-escalation"), false);
});

const { test, eq } = require("./_harness");
const { resolveAutoMuteThreshold } = require("../../src/systems/automation");

test("manual auto-mute uses maxWarnings as the only base threshold", () => {
  eq(resolveAutoMuteThreshold(4, { enabled: false }, 50), 4);
  eq(resolveAutoMuteThreshold(0, { enabled: false }, 50), null);
  eq(resolveAutoMuteThreshold(-1, { enabled: false }, 50), null);
});

test("manual auto-mute threshold lowers for low Trust only", () => {
  const trustConfig = {
    enabled: true,
    min: 0,
    max: 100,
    lowThreshold: 25,
    highThreshold: 75,
    lowTrustWarningsPenalty: 1,
    highTrustWarningsBonus: 1,
  };
  eq(resolveAutoMuteThreshold(3, trustConfig, 10), 2);
  eq(resolveAutoMuteThreshold(3, trustConfig, 90), 3);
});
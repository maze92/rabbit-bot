const { test, eq } = require("./_harness");
const User = require("../../src/database/models/User");
const warningsService = require("../../src/systems/warningsService");

test("applyMutePenalty resets current warnings", async () => {
  const originalFindOne = User.findOne;
  const user = {
    warnings: 2,
    trust: 50,
    lastInfractionAt: new Date(),
    lastTrustUpdateAt: new Date(),
    trustHistory: [],
    save: async () => {},
  };

  User.findOne = async () => user;
  try {
    const updatedUser = await warningsService.applyMutePenalty(
      null,
      "test-user",
    );
    eq(updatedUser.warnings, 0);
    eq(updatedUser.trust, 30);
  } finally {
    User.findOne = originalFindOne;
  }
});

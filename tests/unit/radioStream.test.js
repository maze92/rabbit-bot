const { test, ok } = require("./_harness");
const { normalizeFeature, normalizeFeatures } = require("../../src/systems/featuresService");

test("radio is no longer part of the feature configuration schema", async () => {
  const radio = normalizeFeature("radio", {});
  ok(!Object.prototype.hasOwnProperty.call(radio, "enabled"), "retired radio settings should not be normalized");
});

test("normalizeFeatures omits legacy radio configuration", async () => {
  const all = normalizeFeatures({ radio: { enabled: true, streamUrl: "https://example.com/radio.mp3" } });
  ok(!Object.prototype.hasOwnProperty.call(all, "radio"), "legacy radio data should not be exposed as a feature");
});

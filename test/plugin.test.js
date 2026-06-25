"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const pluginFactory = require("../plugin");

test("normalizes configured defaults", () => {
  const options = pluginFactory._private.normalizeOptions({
    refreshIntervalMs: 50,
    defaultLatitude: "57.1",
    defaultLongitude: "-6.2",
    defaultZoom: 99,
  });
  assert.equal(options.refreshIntervalMs, 500);
  assert.equal(options.defaultLatitude, 57.1);
  assert.equal(options.defaultLongitude, -6.2);
  assert.equal(options.defaultZoom, 18);
});

test("status declares that AIS targets are intentionally absent", () => {
  const app = {
    setPluginStatus() {},
    getSelfPath(path) {
      if (path === "plugins.ajrmMarineGpsIntegrity.navigationIntegrity") return { value: { trust: "normal" } };
      return null;
    },
  };
  const plugin = pluginFactory(app);
  plugin.start({});
  let json = null;
  plugin.registerWithRouter({
    get(path, handler) {
      if (path === "/status") handler({}, { json(value) { json = value; } });
    },
  });
  assert.equal(json.noAisTargets, true);
  assert.match(json.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(json.ajrmMarineGpsIntegrity, { trust: "normal" });
});

test("unwraps plain Signal K values without changing them", () => {
  assert.equal(pluginFactory._private.unwrapSignalKValue(42), 42);
  assert.deepEqual(pluginFactory._private.unwrapSignalKValue({ value: { ok: true } }), { ok: true });
});

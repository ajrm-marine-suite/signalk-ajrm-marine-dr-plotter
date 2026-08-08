"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const createPlugin = require("../plugin");

test("retirement marker points to Navigation Integrity", () => {
  let status = "";
  const plugin = createPlugin({ setPluginStatus(value) { status = value; } });
  plugin.start();
  assert.match(status, /Navigation Integrity v0\.8\.0 or later/);
  assert.equal(plugin.schema.type, "object");
});

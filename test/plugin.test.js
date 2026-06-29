"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const pluginFactory = require("../plugin");
const packageInfo = require("../package.json");

test("package declares GPS Integrity as the DR state provider", () => {
  assert.deepEqual(packageInfo.signalk.requires, [
    "signalk-ajrm-marine-gps-integrity",
  ]);
});

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
    put() {},
    post() {},
    delete() {},
  });
  assert.equal(json.noAisTargets, true);
  assert.match(json.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(json.ajrmMarineGpsIntegrity, { trust: "normal" });
});

test("unwraps plain Signal K values without changing them", () => {
  assert.equal(pluginFactory._private.unwrapSignalKValue(42), 42);
  assert.deepEqual(pluginFactory._private.unwrapSignalKValue({ value: { ok: true } }), { ok: true });
});

test("normalizes persisted plot fixes", () => {
  const fixes = pluginFactory._private.normalizePlotFixes([
    {
      id: "lost-fix",
      timestamp: "2026-06-29T10:00:00.000Z",
      automatic: true,
      plotType: "gps-lost",
      position: { latitude: "56.2", longitude: "-5.5" },
      trust: "lost",
      drSource: "heading-stw-current",
      uncertaintyRadiusMeters: "42",
      lastTrustedFixAgeSeconds: "600",
      distanceFromLastTrustedFixMeters: "1234",
      stwMps: "0",
      headingTrueDegrees: "90",
      sogMps: "1.2",
      cogTrueDegrees: "95",
      currentDriftMps: "0.8",
      currentSetTrueDegrees: "180",
    },
    {
      id: "observed",
      timestamp: "2026-06-29T10:05:00.000Z",
      plotType: "observed-fix",
      position: { latitude: 56.21, longitude: -5.56 },
      note: "visual bearings",
    },
  ]);

  assert.equal(fixes.length, 2);
  assert.equal(fixes[0].id, "lost-fix");
  assert.equal(fixes[0].plotType, "gps-lost");
  assert.equal(fixes[0].position.latitude, 56.2);
  assert.equal(fixes[0].distanceFromLastTrustedFixMeters, 1234);
  assert.equal(fixes[1].plotType, "observed-fix");
  assert.equal(fixes[1].note, "visual bearings");
});

test("web app renders lost GPS plot fixes as estimated positions", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

  assert.match(app, /estimated-position/);
  assert.match(app, /trust === "lost"/);
  assert.match(app, /iconSize: \[1, 1\]/);
  assert.match(app, /iconAnchor: \[0, 0\]/);
  assert.match(css, /\.plot-fix-marker\.estimated-position \.plot-fix-symbol/);
  assert.match(css, /transform: translate\(-50%, -50%\)/);
});

test("web app includes Display-style GPS status LED", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

  assert.match(html, /id="gpsStatusIndicator"/);
  assert.match(html, /ajrm-marine-gps-status-led/);
  assert.match(app, /function updateGpsStatusIndicator/);
  assert.match(app, /GPS OK/);
  assert.match(app, /GPS LOST/);
  assert.match(css, /\.ajrm-marine-gps-status-ok \.ajrm-marine-gps-status-led/);
  assert.match(css, /\.ajrm-marine-gps-status-alert \.ajrm-marine-gps-status-led/);
});

test("web app exposes manual plot-fix pruning", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(html, /id="prunePlotFixesAge"/);
  assert.match(html, /Prune old fixes/);
  assert.match(app, /function pruneOldPlotFixes/);
  assert.match(app, /savePlotFixesServer\(\)/);
});

test("web app shows live cursor latitude and longitude", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

  assert.match(html, /id="cursorPosition"/);
  assert.match(app, /map\.on\("mousemove", updateCursorPosition\)/);
  assert.match(app, /function formatLatLon/);
  assert.match(css, /\.cursor-position/);
});

test("web app exposes a debugging clear-all-plots control", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(html, /id="clearAllPlots"/);
  assert.match(app, /function clearAllPlots/);
  assert.match(app, /operationalTrack = \[\]/);
});

test("web app can submit observed fixes to GPS Integrity", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

  assert.match(html, /id="manualFixLatitude"/);
  assert.match(html, /Set observed fix/);
  assert.match(app, /gpsIntegrityApiBase/);
  assert.match(app, /function applyManualFix/);
  assert.match(app, /observed-fix/);
  assert.match(css, /\.plot-fix-marker\.observed-fix/);
});

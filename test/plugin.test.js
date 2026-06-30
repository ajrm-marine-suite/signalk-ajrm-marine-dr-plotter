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
    coordinateFormat: "decimal",
    plotFixIntervalMinutes: "999",
  });
  assert.equal(options.refreshIntervalMs, 500);
  assert.equal(options.defaultLatitude, 57.1);
  assert.equal(options.defaultLongitude, -6.2);
  assert.equal(options.defaultZoom, 18);
  assert.equal(options.coordinateFormat, "decimal");
  assert.equal(options.plotFixIntervalMinutes, 120);
  assert.equal(pluginFactory._private.normalizeOptions({ coordinateFormat: "bad" }).coordinateFormat, "dms");
  assert.equal(pluginFactory._private.normalizeOptions({}, { plotFixIntervalMinutes: 5 }).plotFixIntervalMinutes, 5);
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
  assert.equal(json.coordinateFormat, "dms");
  assert.equal(json.plotFixIntervalMinutes, 10);
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
    {
      id: "gps-return",
      timestamp: "2026-06-29T10:06:00.000Z",
      plotType: "gps-return",
      position: { latitude: 56.22, longitude: -5.57 },
    },
  ]);

  assert.equal(fixes.length, 3);
  assert.equal(fixes[0].id, "lost-fix");
  assert.equal(fixes[0].plotType, "gps-lost");
  assert.equal(fixes[0].position.latitude, 56.2);
  assert.equal(fixes[0].distanceFromLastTrustedFixMeters, 1234);
  assert.equal(fixes[1].plotType, "observed-fix");
  assert.equal(fixes[1].note, "visual bearings");
  assert.equal(fixes[2].plotType, "gps-return");
  assert.equal(fixes[2].resource.resourceType, "fixes");
  assert.deepEqual(fixes[2].resource.feature.geometry.coordinates, [-5.57, 56.22]);
  assert.equal(fixes[2].resource.feature.properties.symbol, "square-dot");
});

test("web app renders lost GPS plot fixes as estimated positions", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

  assert.match(app, /estimated-position/);
  assert.match(app, /trust === "lost"/);
  assert.match(app, /className: `plot-fix-symbol-marker/);
  assert.match(app, /className: "plot-fix-label-marker"/);
  assert.match(app, /iconSize: \[28, 28\]/);
  assert.match(app, /iconAnchor: \[14, 14\]/);
  assert.match(css, /\.plot-fix-symbol-marker\.estimated-position \.plot-fix-symbol/);
  assert.match(css, /left: 14px/);
  assert.match(css, /top: 14px/);
  assert.match(css, /transform: translate\(-50%, -50%\)/);
  assert.match(app, /Tide drift \/ set/);
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

test("web app hides the independent DR uncertainty circle", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(app, /addPoint\(integrityPosition, "integrity-dr", "IDR"\)/);
  assert.doesNotMatch(app, /radius: integrityDr\.uncertaintyRadiusMeters/);
});

test("web app exposes manual plot-fix pruning", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(html, /id="prunePlotFixesAge"/);
  assert.match(html, /Prune old fixes/);
  assert.match(app, /function pruneOldPlotFixes/);
  assert.match(app, /savePlotFixesServer\(\)/);
});

test("web app forces breadcrumb points at plotted electronic fixes", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(app, /updateOperationalTrack\(normalized\.position, normalized\.timestamp, true\)/);
  assert.match(app, /function updateOperationalTrack\(position, timestamp, force = false\)/);
  assert.match(app, /!force && last && distanceMeters\(last, position\) < 2/);
});

test("server creates a GPS-return fix from the returned GPS coordinate", () => {
  const fix = pluginFactory._private.createPlotFixFromIntegrityState(
    {
      timestamp: "2026-06-29T18:56:00.000Z",
      trust: "normal",
      acceptedGps: true,
      gps: {
        position: { latitude: 56.2, longitude: -5.5 },
        speedOverGround: 2,
        courseOverGroundTrue: Math.PI / 2,
      },
      operationalDeadReckoning: {
        position: { latitude: 56.3, longitude: -5.6 },
        source: "heading-stw-current",
        uncertaintyRadiusMeters: 120,
      },
      lastTrustedFix: {
        timestamp: "2026-06-29T18:50:00.000Z",
        position: { latitude: 56.19, longitude: -5.49 },
      },
      vectors: {
        courseOverGround: { speedMps: 2, bearingTrueDegrees: 90 },
      },
    },
    true,
    "gps-return",
  );

  assert.equal(fix.plotType, "gps-return");
  assert.deepEqual(fix.position, { latitude: 56.2, longitude: -5.5 });
  assert.equal(fix.cogTrueDegrees, 90);
  assert.equal(fix.distanceFromLastTrustedFixMeters > 0, true);
});

test("server exposes plot fixes as resource-style fix features", () => {
  const resource = pluginFactory._private.plotFixToResource({
    id: "return",
    timestamp: "2026-06-29T18:56:00.000Z",
    plotType: "gps-return",
    position: { latitude: 56.2, longitude: -5.5 },
    trust: "normal",
    uncertaintyRadiusMeters: 12,
  });

  assert.equal(resource.id, "return");
  assert.equal(resource.resourceType, "fixes");
  assert.equal(resource.feature.type, "Feature");
  assert.deepEqual(resource.feature.geometry.coordinates, [-5.5, 56.2]);
  assert.equal(resource.feature.properties.method, "electronic");
  assert.equal(resource.feature.properties.symbol, "square-dot");
  assert.equal(resource.feature.properties.trust, "normal");
  assert.equal(resource.feature.properties.uncertaintyRadiusMeters, 12);
});

test("web app reloads server-authored plot fixes when status changes", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const plugin = fs.readFileSync(path.join(__dirname, "..", "plugin", "index.js"), "utf8");

  assert.match(app, /latestStatus\.plotFixesUpdatedAt/);
  assert.match(app, /lastPlotFixesUpdatedAt/);
  assert.doesNotMatch(app, /lastTrustState === "lost"/);
  assert.doesNotMatch(app, /function maybeAddAutomaticPlotFix/);
  assert.doesNotMatch(app, /plotFixIntervalStorageKey/);
  assert.match(plugin, /appendTimedPlotFixIfDue/);
  assert.match(plugin, /plotFixIntervalMinutes/);
  assert.match(plugin, /router\.put\("\/settings"/);
  assert.match(app, /\/settings`, "PUT"/);
  assert.match(app, /if \(plotFix\.plotType === "gps-return"\) return "GPS fix"/);
});

test("web app shows live cursor latitude and longitude", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

  assert.match(html, /id="cursorPosition"/);
  assert.match(app, /map\.on\("mousemove", updateCursorPosition\)/);
  assert.match(app, /function formatLatLon/);
  assert.match(app, /function formatCoordinate/);
  assert.match(app, /function cursorRangeText/);
  assert.match(app, /function bearingDegrees/);
  assert.match(app, /Range/);
  assert.match(app, /coordinateFormat = "dms"/);
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
  assert.match(html, /id="pickManualFixFromCursor"/);
  assert.match(html, /type="text" inputmode="text"/);
  assert.match(html, /56N 12' 40\.4''/);
  assert.match(html, /5W 33' 28\.4''/);
  assert.match(html, /Set observed fix/);
  assert.match(app, /gpsIntegrityApiBase/);
  assert.match(app, /function applyManualFix/);
  assert.match(app, /function parseCoordinateInput/);
  assert.match(app, /text\.match\(\/\[NSEW\]\//);
  assert.match(app, /function formatCoordinateInput/);
  assert.match(app, /function startManualFixPickMode/);
  assert.match(app, /function handleMapClick/);
  assert.match(app, /formatCoordinateInput\(lat, "N", "S"\)/);
  assert.match(app, /observed-fix/);
  assert.match(css, /\.plot-fix-symbol-marker\.observed-fix/);
  assert.match(css, /\.manual-fix-pick-mode/);
});

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageInfo = require("../package.json");

const PLUGIN_ID = "signalk-ajrm-marine-dr-plotter";
const AJRM_MARINE_GPS_INTEGRITY_STATE_PATH = "plugins.ajrmMarineGpsIntegrity.navigationIntegrity";
const DATA_DIRECTORY = path.join(os.homedir(), ".signalk", "plugin-config-data", PLUGIN_ID);
const PLOT_FIXES_FILE = path.join(DATA_DIRECTORY, "plot-fixes.json");
const MAX_PLOT_FIXES = 1000;

module.exports = function ajrmMarineDrPlotter(app) {
  const plugin = {};
  let options = normalizeOptions({});
  let startedAt = null;
  let unsubscribes = [];
  let lastTrustState = null;
  let gpsLostPlotFixRecordedFor = null;
  let plotFixesUpdatedAt = null;

  plugin.id = PLUGIN_ID;
  plugin.name = "AJRM Marine DR Plotter";
  plugin.description =
    "Own-vessel dead-reckoning chart plotter for GPS integrity, uncertainty, and navigation vectors.";

  plugin.schema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", title: "Enable DR Plotter web app", default: true },
      refreshIntervalMs: {
        type: "integer",
        title: "Plot refresh interval",
        default: 1000,
        minimum: 500,
        maximum: 10000,
      },
      defaultLatitude: {
        type: "number",
        title: "Fallback chart latitude",
        default: 56.21,
      },
      defaultLongitude: {
        type: "number",
        title: "Fallback chart longitude",
        default: -5.56,
      },
      defaultZoom: {
        type: "integer",
        title: "Fallback chart zoom",
        default: 11,
        minimum: 1,
        maximum: 18,
      },
      coordinateFormat: {
        type: "string",
        title: "Latitude/longitude display format",
        description: "Controls cursor and popup coordinate display. Internal storage remains decimal degrees.",
        default: "dms",
        enum: ["dms", "degrees-minutes", "decimal"],
        enumNames: ["Degrees minutes seconds", "Degrees decimal minutes", "Decimal degrees"],
      },
    },
  };

  plugin.start = (pluginOptions = {}) => {
    options = normalizeOptions(pluginOptions);
    startedAt = new Date().toISOString();
    subscribe();
    recordAutomaticFixes(getSelfPath(app, AJRM_MARINE_GPS_INTEGRITY_STATE_PATH)).catch((error) => {
      app.error?.(`[${PLUGIN_ID}] startup plot-fix check failed: ${error.stack || error.message}`);
    });
    app.setPluginStatus?.(`${options.enabled ? "Started" : "Disabled"} v${packageInfo.version}`);
  };

  plugin.stop = () => {
    for (const unsubscribe of unsubscribes) {
      try {
        unsubscribe();
      } catch (_error) {
        // Best effort unsubscribe during Signal K plugin shutdown.
      }
    }
    unsubscribes = [];
    startedAt = null;
    lastTrustState = null;
    gpsLostPlotFixRecordedFor = null;
  };

  plugin.registerWithRouter = (router) => {
    router.get("/status", (_req, res) => {
      res.json(status());
    });

    router.get("/plot-fixes", async (_req, res) => {
      try {
        res.json({ ok: true, plotFixes: await loadPlotFixes() });
      } catch (error) {
        app.error?.(`[${PLUGIN_ID}] plot-fix load failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.get("/fixes", async (_req, res) => {
      try {
        const plotFixes = await loadPlotFixes();
        res.json({
          ok: true,
          resourceType: "fixes",
          fixes: plotFixes.map(plotFixToResource),
        });
      } catch (error) {
        app.error?.(`[${PLUGIN_ID}] fix resource load failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.put("/plot-fixes", async (req, res) => {
      try {
        const plotFixes = normalizePlotFixes(req.body?.plotFixes || req.body?.fixes || []);
        await savePlotFixes(plotFixes);
        plotFixesUpdatedAt = new Date().toISOString();
        res.json({ ok: true, plotFixes });
      } catch (error) {
        app.error?.(`[${PLUGIN_ID}] plot-fix save failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.post("/plot-fixes", async (req, res) => {
      try {
        const existing = await loadPlotFixes();
        const plotFix = normalizePlotFix(req.body?.plotFix || req.body);
        if (!plotFix) {
          res.status(400).json({ ok: false, error: "Invalid plot fix." });
          return;
        }
        const plotFixes = normalizePlotFixes([...existing, plotFix]);
        await savePlotFixes(plotFixes);
        plotFixesUpdatedAt = new Date().toISOString();
        res.json({ ok: true, plotFix, plotFixes });
      } catch (error) {
        app.error?.(`[${PLUGIN_ID}] plot-fix append failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.delete("/plot-fixes", async (_req, res) => {
      try {
        await savePlotFixes([]);
        plotFixesUpdatedAt = new Date().toISOString();
        res.json({ ok: true, plotFixes: [] });
      } catch (error) {
        app.error?.(`[${PLUGIN_ID}] plot-fix clear failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.get("/charts", async (_req, res) => {
      try {
        if (!app.resourcesApi?.listResources) {
          throw new Error("Signal K resources API is not available.");
        }
        const charts = await app.resourcesApi.listResources("charts", {});
        res.json({ ok: true, charts: charts || {} });
      } catch (error) {
        app.error?.(`[${PLUGIN_ID}] chart resource list failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });
  };

  return plugin;

  function status() {
    const integrity = getSelfPath(app, AJRM_MARINE_GPS_INTEGRITY_STATE_PATH) || null;
    recordAutomaticFixes(integrity).catch((error) => {
      app.error?.(`[${PLUGIN_ID}] status plot-fix check failed: ${error.stack || error.message}`);
    });
    return {
      ok: true,
      plugin: PLUGIN_ID,
      version: packageInfo.version,
      enabled: options.enabled,
      refreshIntervalMs: options.refreshIntervalMs,
      coordinateFormat: options.coordinateFormat,
      startedAt,
      noAisTargets: true,
      defaults: {
        latitude: options.defaultLatitude,
        longitude: options.defaultLongitude,
        zoom: options.defaultZoom,
      },
      plotFixesUpdatedAt,
      ajrmMarineGpsIntegrity: integrity,
      ajrmMarineGpsIntegrityStatePath: `vessels.self.${AJRM_MARINE_GPS_INTEGRITY_STATE_PATH}`,
    };
  }

  function subscribe() {
    if (!options.enabled || !app.subscriptionmanager?.subscribe) return;
    app.subscriptionmanager.subscribe(
      {
        context: "vessels.self",
        subscribe: [
          {
            path: AJRM_MARINE_GPS_INTEGRITY_STATE_PATH,
            policy: "instant",
            format: "delta",
          },
        ],
      },
      unsubscribes,
      (error) => app.error?.(`[${PLUGIN_ID}] subscription error: ${error}`),
      handleDelta,
    );
  }

  function handleDelta(delta) {
    for (const update of delta?.updates || []) {
      for (const value of update?.values || []) {
        if (value?.path === AJRM_MARINE_GPS_INTEGRITY_STATE_PATH) {
          recordAutomaticFixes(value.value).catch((error) => {
            app.error?.(`[${PLUGIN_ID}] automatic plot-fix failed: ${error.stack || error.message}`);
          });
        }
      }
    }
  }

  async function recordAutomaticFixes(state) {
    const trust = state?.trust || "unknown";
    if (trust !== "lost") {
      if (lastTrustState === "lost" && state?.acceptedGps === true && state?.gps?.position) {
        await appendPlotFix(createPlotFixFromIntegrityState(state, true, "gps-return"));
      }
      if (trust !== lastTrustState) gpsLostPlotFixRecordedFor = null;
      lastTrustState = trust;
      return;
    }

    const lostKey = state?.lastTrustedFix?.timestamp || state?.timestamp || "lost";
    if (lastTrustState === "lost" || gpsLostPlotFixRecordedFor === lostKey) return;
    const recorded = await appendPlotFix(createPlotFixFromIntegrityState(state, true, "gps-lost"));
    if (recorded) gpsLostPlotFixRecordedFor = lostKey;
    lastTrustState = trust;
  }

  async function appendPlotFix(plotFix) {
    const normalized = normalizePlotFix(plotFix);
    if (!normalized) return null;
    const existing = await loadPlotFixes();
    const plotFixes = normalizePlotFixes([...existing, normalized]);
    await savePlotFixes(plotFixes);
    plotFixesUpdatedAt = new Date().toISOString();
    return normalized;
  }
};

async function loadPlotFixes() {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(PLOT_FIXES_FILE, "utf8"));
    return normalizePlotFixes(parsed?.plotFixes || parsed?.fixes || []);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function savePlotFixes(plotFixes) {
  const normalized = normalizePlotFixes(plotFixes);
  await fs.promises.mkdir(DATA_DIRECTORY, { recursive: true });
  const temporaryPath = `${PLOT_FIXES_FILE}.tmp`;
  await fs.promises.writeFile(
    temporaryPath,
    `${JSON.stringify({ schemaVersion: 1, plotFixes: normalized }, null, 2)}\n`,
  );
  await fs.promises.rename(temporaryPath, PLOT_FIXES_FILE);
}

function createPlotFixFromIntegrityState(state, automatic, plotType = automatic ? "timed" : "manual") {
  const operationalDr = state?.operationalDeadReckoning || state?.deadReckoning || {};
  const position = plotType === "gps-return"
    ? normalizePosition(state?.gps?.position)
    : ownshipFollowPosition(state);
  if (!position) return null;
  const lastTrustedPosition = normalizePosition(state?.lastTrustedFix?.position);
  const timestamp = normalizeTimestamp(state?.timestamp || new Date().toISOString());
  const timestampMs = Date.parse(timestamp);
  const lastTrustedMs = Date.parse(state?.lastTrustedFix?.timestamp);
  return {
    id: `fix-${timestamp}-${plotType}`,
    timestamp,
    automatic,
    plotType,
    position,
    trust: state?.trust || null,
    drSource: operationalDr.source || null,
    uncertaintyRadiusMeters: operationalDr.uncertaintyRadiusMeters ?? null,
    lastTrustedFixAgeSeconds: Number.isFinite(lastTrustedMs) && Number.isFinite(timestampMs)
      ? Math.max(0, (timestampMs - lastTrustedMs) / 1000)
      : operationalDr.ageSeconds ?? null,
    distanceFromLastTrustedFixMeters: lastTrustedPosition ? distanceMeters(lastTrustedPosition, position) : null,
    stwMps: state?.vectors?.headingThroughWater?.speedMps ?? null,
    headingTrueDegrees: state?.vectors?.headingThroughWater?.bearingTrueDegrees ?? null,
    sogMps: state?.vectors?.courseOverGround?.speedMps ?? state?.gps?.speedOverGround ?? null,
    cogTrueDegrees: state?.vectors?.courseOverGround?.bearingTrueDegrees ?? radiansToDegrees(state?.gps?.courseOverGroundTrue),
    currentDriftMps: state?.vectors?.tide?.speedMps ?? null,
    currentSetTrueDegrees: state?.vectors?.tide?.bearingTrueDegrees ?? null,
  };
}

function ownshipFollowPosition(state) {
  return (
    normalizePosition(state?.operationalDeadReckoning?.position) ||
    normalizePosition(state?.deadReckoning?.position) ||
    normalizePosition(state?.gps?.position) ||
    null
  );
}

function normalizePlotFixes(value) {
  const fixes = (Array.isArray(value) ? value : [])
    .map(normalizePlotFix)
    .filter(Boolean)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const byId = new Map();
  for (const fix of fixes) byId.set(fix.id, fix);
  return [...byId.values()].slice(-MAX_PLOT_FIXES);
}

function normalizePlotFix(value) {
  const position = normalizePosition(value?.position);
  const timestamp = normalizeTimestamp(value?.timestamp);
  if (!position || !timestamp) return null;
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 80) : `plot-${timestamp}`,
    timestamp,
    automatic: value.automatic === true,
    position,
    trust: stringOrNull(value.trust),
    drSource: stringOrNull(value.drSource),
    uncertaintyRadiusMeters: finiteOrNull(value.uncertaintyRadiusMeters),
    plotType: normalizePlotType(value.plotType),
    note: stringOrNull(value.note),
    lastTrustedFixAgeSeconds: finiteOrNull(value.lastTrustedFixAgeSeconds),
    distanceFromLastTrustedFixMeters: finiteOrNull(value.distanceFromLastTrustedFixMeters),
    stwMps: finiteOrNull(value.stwMps),
    headingTrueDegrees: finiteOrNull(value.headingTrueDegrees),
    sogMps: finiteOrNull(value.sogMps),
    cogTrueDegrees: finiteOrNull(value.cogTrueDegrees),
    currentDriftMps: finiteOrNull(value.currentDriftMps),
    currentSetTrueDegrees: finiteOrNull(value.currentSetTrueDegrees),
    resource: normalizeFixResource(value),
  };
}

function normalizeFixResource(value) {
  const position = normalizePosition(value?.position);
  const timestamp = normalizeTimestamp(value?.timestamp);
  if (!position || !timestamp) return null;
  const plotType = normalizePlotType(value.plotType);
  const properties = {
    timestamp,
    method: fixMethod(plotType, value?.trust),
    symbol: fixSymbol(plotType, value?.trust),
    type: plotType || "manual",
    source: PLUGIN_ID,
    trust: stringOrNull(value?.trust),
    note: stringOrNull(value?.note),
    drSource: stringOrNull(value?.drSource),
    uncertaintyRadiusMeters: finiteOrNull(value?.uncertaintyRadiusMeters),
    lastTrustedFixAgeSeconds: finiteOrNull(value?.lastTrustedFixAgeSeconds),
    distanceFromLastTrustedFixMeters: finiteOrNull(value?.distanceFromLastTrustedFixMeters),
    stwMps: finiteOrNull(value?.stwMps),
    headingTrueDegrees: finiteOrNull(value?.headingTrueDegrees),
    sogMps: finiteOrNull(value?.sogMps),
    cogTrueDegrees: finiteOrNull(value?.cogTrueDegrees),
    currentDriftMps: finiteOrNull(value?.currentDriftMps),
    currentSetTrueDegrees: finiteOrNull(value?.currentSetTrueDegrees),
  };
  return {
    resourceType: "fixes",
    feature: {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [position.longitude, position.latitude],
      },
      properties,
    },
  };
}

function plotFixToResource(plotFix) {
  const normalized = normalizePlotFix(plotFix);
  if (!normalized?.resource) return null;
  return {
    id: normalized.id,
    name: `${fixTitle(normalized.plotType, normalized.trust)} ${normalized.timestamp.slice(11, 16)}`,
    description: normalized.note || fixTitle(normalized.plotType, normalized.trust),
    ...normalized.resource,
  };
}

function fixTitle(plotType, trust) {
  if (plotType === "observed-fix") return "Observed fix";
  if (plotType === "gps-lost" || trust === "lost") return "Estimated position";
  if (plotType === "gps-return") return "GPS fix";
  if (plotType === "timed") return "Timed electronic fix";
  return "Dead reckoning fix";
}

function fixMethod(plotType, trust) {
  if (plotType === "observed-fix") return "observed";
  if (plotType === "gps-lost" || trust === "lost") return "estimated";
  if (plotType === "gps-return" || plotType === "timed") return "electronic";
  return "dead-reckoning";
}

function fixSymbol(plotType, trust) {
  if (plotType === "observed-fix") return "circle-dot";
  if (plotType === "gps-lost" || trust === "lost") return "triangle-dot";
  if (plotType === "gps-return" || plotType === "timed") return "square-dot";
  return "half-circle-dot";
}

function normalizePlotType(value) {
  return ["manual", "timed", "gps-lost", "gps-return", "observed-fix"].includes(value) ? value : null;
}

function normalizePosition(value) {
  const latitude = finiteOrNull(value?.latitude);
  const longitude = finiteOrNull(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function normalizeTimestamp(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : null;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getSelfPath(app, path) {
  try {
    return unwrapSignalKValue(app.getSelfPath?.(path));
  } catch (_error) {
    return undefined;
  }
}

function unwrapSignalKValue(entry) {
  if (entry && typeof entry === "object" && Object.hasOwn(entry, "value")) return entry.value;
  return entry;
}

function normalizeOptions(value = {}) {
  const refreshIntervalMs = Number.parseInt(value.refreshIntervalMs, 10);
  const defaultZoom = Number.parseInt(value.defaultZoom, 10);
  return {
    enabled: value.enabled !== false,
    refreshIntervalMs: Number.isFinite(refreshIntervalMs)
      ? Math.min(10000, Math.max(500, refreshIntervalMs))
      : 1000,
    defaultLatitude: finite(value.defaultLatitude, 56.21),
    defaultLongitude: finite(value.defaultLongitude, -5.56),
    defaultZoom: Number.isFinite(defaultZoom) ? Math.min(18, Math.max(1, defaultZoom)) : 11,
    coordinateFormat: normalizeCoordinateFormat(value.coordinateFormat),
  };
}

function normalizeCoordinateFormat(value) {
  return ["dms", "degrees-minutes", "decimal"].includes(value) ? value : "dms";
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function radiansToDegrees(value) {
  const number = Number(value);
  return Number.isFinite(number) ? ((number * 180 / Math.PI) + 360) % 360 : null;
}

function distanceMeters(left, right) {
  const from = normalizePosition(left);
  const to = normalizePosition(right);
  if (!from || !to) return null;
  const radius = 6371000;
  const phi1 = from.latitude * Math.PI / 180;
  const phi2 = to.latitude * Math.PI / 180;
  const deltaPhi = (to.latitude - from.latitude) * Math.PI / 180;
  const deltaLambda = (to.longitude - from.longitude) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports._private = {
  createPlotFixFromIntegrityState,
  normalizePlotFix,
  normalizePlotFixes,
  normalizeOptions,
  plotFixToResource,
  unwrapSignalKValue,
};

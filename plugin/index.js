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
    },
  };

  plugin.start = (pluginOptions = {}) => {
    options = normalizeOptions(pluginOptions);
    startedAt = new Date().toISOString();
    app.setPluginStatus?.(`${options.enabled ? "Started" : "Disabled"} v${packageInfo.version}`);
  };

  plugin.stop = () => {
    startedAt = null;
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

    router.put("/plot-fixes", async (req, res) => {
      try {
        const plotFixes = normalizePlotFixes(req.body?.plotFixes || req.body?.fixes || []);
        await savePlotFixes(plotFixes);
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
        res.json({ ok: true, plotFix, plotFixes });
      } catch (error) {
        app.error?.(`[${PLUGIN_ID}] plot-fix append failed: ${error.stack || error.message}`);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    router.delete("/plot-fixes", async (_req, res) => {
      try {
        await savePlotFixes([]);
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
    return {
      ok: true,
      plugin: PLUGIN_ID,
      version: packageInfo.version,
      enabled: options.enabled,
      refreshIntervalMs: options.refreshIntervalMs,
      startedAt,
      noAisTargets: true,
      defaults: {
        latitude: options.defaultLatitude,
        longitude: options.defaultLongitude,
        zoom: options.defaultZoom,
      },
      ajrmMarineGpsIntegrity: getSelfPath(app, AJRM_MARINE_GPS_INTEGRITY_STATE_PATH) || null,
      ajrmMarineGpsIntegrityStatePath: `vessels.self.${AJRM_MARINE_GPS_INTEGRITY_STATE_PATH}`,
    };
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

function normalizePlotFixes(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizePlotFix)
    .filter(Boolean)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .slice(-MAX_PLOT_FIXES);
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
    lastTrustedFixAgeSeconds: finiteOrNull(value.lastTrustedFixAgeSeconds),
    distanceFromLastTrustedFixMeters: finiteOrNull(value.distanceFromLastTrustedFixMeters),
    stwMps: finiteOrNull(value.stwMps),
    headingTrueDegrees: finiteOrNull(value.headingTrueDegrees),
    sogMps: finiteOrNull(value.sogMps),
    cogTrueDegrees: finiteOrNull(value.cogTrueDegrees),
    currentDriftMps: finiteOrNull(value.currentDriftMps),
    currentSetTrueDegrees: finiteOrNull(value.currentSetTrueDegrees),
  };
}

function normalizePlotType(value) {
  return ["manual", "timed", "gps-lost"].includes(value) ? value : null;
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
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

module.exports._private = {
  normalizePlotFix,
  normalizePlotFixes,
  normalizeOptions,
  unwrapSignalKValue,
};

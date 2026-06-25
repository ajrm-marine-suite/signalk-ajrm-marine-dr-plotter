"use strict";

const packageInfo = require("../package.json");

const PLUGIN_ID = "signalk-ajrm-marine-dr-plotter";
const AJRM_MARINE_GPS_INTEGRITY_STATE_PATH = "plugins.ajrmMarineGpsIntegrity.navigationIntegrity";

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
  normalizeOptions,
  unwrapSignalKValue,
};

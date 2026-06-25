const apiBase = "/plugins/signalk-ajrm-marine-dr-plotter";
const elements = {
  map: document.querySelector("#map"),
  subtitle: document.querySelector("#subtitle"),
  toggleStatus: document.querySelector("#toggleStatus"),
  toggleCharts: document.querySelector("#toggleCharts"),
  centreOwnship: document.querySelector("#centreOwnship"),
  statusDrawer: document.querySelector("#statusDrawer"),
  chartDrawer: document.querySelector("#chartDrawer"),
  statusLine: document.querySelector("#statusLine"),
  trustBadge: document.querySelector("#trustBadge"),
  warningText: document.querySelector("#warningText"),
  fixAge: document.querySelector("#fixAge"),
  uncertainty: document.querySelector("#uncertainty"),
  drSource: document.querySelector("#drSource"),
  hdop: document.querySelector("#hdop"),
  chartStatus: document.querySelector("#chartStatus"),
  baseMapChoices: [...document.querySelectorAll('input[name="baseMap"]')],
  autoCharts: document.querySelector("#checkAutoCharts"),
  openSeaMap: document.querySelector("#checkOpenSeaMap"),
  toast: document.querySelector("#toast"),
};

let map;
let baseLayers = {};
let currentBaseLayer;
let autoChartGroup;
let autoChartLayer;
let autoChartFallbackLayer;
let autoChartId;
let autoChartList = [];
let chartResourcesLoaded = false;
let chartResourcesLoading = null;
let seamarkLayer;
let trackLayer;
let overlayLayer;
let latestStatus = null;
let mapFollowSelf = true;
let disableMapFollowPause = false;
let operationalTrack = [];
let operationalTrackStartedAt = null;
const maxTrackPoints = 7200;
const trackStorageKey = "ajrmMarineDrPlotterOperationalTrack";
const chartLayerZIndex = 650;
const seamarkLayerZIndex = 750;

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.style.background = isError ? "#7f1d1d" : "#0f172a";
  elements.toast.classList.add("visible");
  setTimeout(() => elements.toast.classList.remove("visible"), 3000);
}

async function requestJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || response.statusText);
  return data;
}

function initMap(defaults = {}) {
  const lat = Number(defaults.latitude) || 56.21;
  const lon = Number(defaults.longitude) || -5.56;
  const zoom = Number(defaults.zoom) || 11;
  map = L.map(elements.map, { zoomControl: true }).setView([lat, lon], zoom);
  const naturalEarth = makeNaturalEarthLayer();
  const empty = L.tileLayer("");
  const openStreetMap = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 19,
    maxZoom: 22,
    attribution: "© OpenStreetMap contributors",
  });
  const openTopoMap = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 17,
    maxZoom: 22,
    attribution: "Map data © OpenStreetMap contributors | Style © OpenTopoMap",
  });
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxNativeZoom: 17, maxZoom: 22, attribution: "© Esri © OpenStreetMap Contributors" },
  );
  seamarkLayer = L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
    maxNativeZoom: 19,
    maxZoom: 22,
    zIndex: seamarkLayerZIndex,
    attribution: "© OpenSeaMap contributors",
  });
  baseLayers = {
    Empty: empty,
    "NaturalEarth (offline)": naturalEarth,
    OpenStreetMap: openStreetMap,
    OpenTopoMap: openTopoMap,
    Satellite: satellite,
  };
  autoChartGroup = L.layerGroup();
  trackLayer = L.layerGroup().addTo(map);
  overlayLayer = L.layerGroup().addTo(map);
  loadOperationalTrack();
  redrawOperationalTrack();
  setBaseMap(localStorage.getItem("ajrmMarineDrPlotterBaseMap") || "NaturalEarth (offline)");
  setOverlay(autoChartGroup, localStorage.getItem("ajrmMarineDrPlotterAutoCharts") === "true", "ajrmMarineDrPlotterAutoCharts");
  setOverlay(seamarkLayer, localStorage.getItem("ajrmMarineDrPlotterOpenSeaMap") !== "false", "ajrmMarineDrPlotterOpenSeaMap");
  map.on("dragstart", pauseMapFollowFromUserAction);
  map.on("moveend zoomend", updateAutoChart);
  updateControlButtonStates();
  loadChartResources();
}

function makeNaturalEarthLayer() {
  if (window.protomapsL?.leafletLayer) {
    const options = {
      url: "./ne_10m_land.pmtiles",
      flavor: "light",
      theme: "light",
      lang: "en",
      maxDataZoom: 5,
    };
    if (window.protomapsL.light && window.protomapsL.paintRules && window.protomapsL.labelRules) {
      options.paintRules = window.protomapsL.paintRules({ ...window.protomapsL.light, water: "rgba(0,0,0,0)" });
      options.labelRules = window.protomapsL.labelRules(window.protomapsL.light);
    }
    return window.protomapsL.leafletLayer(options);
  }
  return L.tileLayer("", { attribution: "NaturalEarth unavailable" });
}

function setBaseMap(name) {
  if (!map || !baseLayers[name]) return;
  if (currentBaseLayer) map.removeLayer(currentBaseLayer);
  currentBaseLayer = baseLayers[name];
  currentBaseLayer.addTo(map);
  localStorage.setItem("ajrmMarineDrPlotterBaseMap", name);
  for (const choice of elements.baseMapChoices) choice.checked = choice.value === name;
  keepChartLayersOnTop();
}

function setOverlay(layer, enabled, storageKey) {
  if (!map || !layer) return;
  if (enabled) layer.addTo(map);
  else map.removeLayer(layer);
  localStorage.setItem(storageKey, String(enabled));
  if (layer === autoChartGroup) elements.autoCharts.checked = enabled;
  if (layer === seamarkLayer) elements.openSeaMap.checked = enabled;
  updateAutoChart();
  keepChartLayersOnTop();
}

async function setAutoChartsEnabled(enabled) {
  setOverlay(autoChartGroup, enabled, "ajrmMarineDrPlotterAutoCharts");
  if (enabled && !chartResourcesLoaded) {
    elements.chartStatus.textContent = "Loading Signal K chart resources...";
    await loadChartResources({ force: true });
    updateAutoChart();
  }
}

async function loadChartResources({ force = false } = {}) {
  if (chartResourcesLoading) return chartResourcesLoading;
  if (chartResourcesLoaded && !force) return autoChartList;
  chartResourcesLoading = (async () => {
    try {
      let charts = null;
      try {
        charts = await requestJson("/signalk/v1/api/resources/charts");
      } catch (_error) {
        const data = await requestJson(`${apiBase}/charts`);
        charts = data.charts || {};
      }
      autoChartList = Object.entries(charts || {}).map(([id, chart]) => ({
        ...(chart || {}),
        __autoChartId: id,
      }));
      chartResourcesLoaded = true;
      elements.chartStatus.textContent = `${autoChartList.length} chart resource${autoChartList.length === 1 ? "" : "s"} found`;
      updateAutoChart();
    } catch (error) {
      autoChartList = [];
      chartResourcesLoaded = false;
      elements.chartStatus.textContent = `Chart resources not available: ${error.message}`;
    } finally {
      chartResourcesLoading = null;
    }
    return autoChartList;
  })();
  return chartResourcesLoading;
}

function chartUrl(chart) {
  return chart?.tilemapUrl || chart?.url || chart?.tileUrl || chart?.href || "";
}

function chartZoom(chart) {
  const min = Number(chart?.minzoom ?? chart?.minZoom ?? 0);
  const max = Number(chart?.maxzoom ?? chart?.maxZoom ?? 24);
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 24,
  };
}

function chartBoundsCandidates(chart) {
  const source =
    chart?.bounds ||
    chart?.boundingBox ||
    chart?.extent ||
    chart?.bbox ||
    chart?.properties?.bounds ||
    chart?.properties?.bbox ||
    chart?.metadata?.bounds;
  const candidates = [];
  if (Array.isArray(source) && source.some(Array.isArray)) {
    const points = source
      .filter(Array.isArray)
      .map((point) => point.slice(0, 2).map(Number))
      .filter((point) => point.length === 2 && point.every(Number.isFinite));
    if (points.length >= 2) {
      const xs = points.map((point) => point[0]);
      const ys = points.map((point) => point[1]);
      candidates.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      candidates.push([Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)]);
    }
  } else {
    let bounds = null;
    if (Array.isArray(source)) {
      bounds = source.slice(0, 4).map(Number);
    } else if (typeof source === "string") {
      bounds = source.split(/[\\s,]+/).map(Number).filter(Number.isFinite).slice(0, 4);
    } else if (source && typeof source === "object") {
      if (source.sw && source.ne) {
        bounds = [
          source.sw.lng ?? source.sw.lon ?? source.sw[1],
          source.sw.lat ?? source.sw[0],
          source.ne.lng ?? source.ne.lon ?? source.ne[1],
          source.ne.lat ?? source.ne[0],
        ].map(Number);
      } else {
        bounds = [
          source.minLon ?? source.west ?? source.left ?? source.minx ?? source.xmin,
          source.minLat ?? source.south ?? source.bottom ?? source.miny ?? source.ymin,
          source.maxLon ?? source.east ?? source.right ?? source.maxx ?? source.xmax,
          source.maxLat ?? source.north ?? source.top ?? source.maxy ?? source.ymax,
        ].map(Number);
      }
    }
    if (bounds?.length >= 4) {
      const [a, b, c, d] = bounds;
      candidates.push([Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]);
      candidates.push([Math.min(b, d), Math.min(a, c), Math.max(b, d), Math.max(a, c)]);
    }
  }
  return candidates.filter(
    (bounds) =>
      bounds.every(Number.isFinite) &&
      bounds[0] >= -180 &&
      bounds[2] <= 180 &&
      bounds[1] >= -90 &&
      bounds[3] <= 90 &&
      bounds[0] < bounds[2] &&
      bounds[1] < bounds[3],
  );
}

function chartBounds(chart, lat, lon) {
  const candidates = chartBoundsCandidates(chart);
  return (
    candidates.find(
      (bounds) => lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3],
    ) ||
    candidates[0] ||
    null
  );
}

function chartContains(chart, lat, lon) {
  const bounds = chartBounds(chart, lat, lon);
  return Boolean(bounds && lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3]);
}

function chartArea(chart, lat, lon) {
  const bounds = chartBounds(chart, lat, lon);
  return bounds ? Math.abs((bounds[2] - bounds[0]) * (bounds[3] - bounds[1])) : Number.MAX_VALUE;
}

function makeAutoChartLayer(chart) {
  const url = chartUrl(chart);
  if (!url) return null;
  const zoom = chartZoom(chart);
  return L.tileLayer(url, {
    minNativeZoom: zoom.min,
    maxNativeZoom: zoom.max,
    minZoom: zoom.min,
    maxZoom: 22,
    zIndex: chartLayerZIndex,
    attribution: "",
    errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
  });
}

function makeAutoChartFallbackLayer() {
  return L.tileLayer("", { attribution: "" });
}

function chooseAutoChart() {
  if (!map) return null;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const containing = autoChartList.filter((chart) => chartContains(chart, center.lat, center.lng));
  const matches = containing.filter((chart) => {
    const range = chartZoom(chart);
    return zoom >= range.min - 0.1 && zoom <= map.getMaxZoom() + 0.1;
  });
  return (
    matches.sort((a, b) => {
      const zoomA = chartZoom(a);
      const zoomB = chartZoom(b);
      return (
        zoomB.min - zoomA.min ||
        chartArea(a, center.lat, center.lng) - chartArea(b, center.lat, center.lng) ||
        zoomB.max - zoomA.max
      );
    })[0] || null
  );
}

function updateAutoChart() {
  if (!map || !autoChartGroup || !map.hasLayer(autoChartGroup)) return;
  if (!chartResourcesLoaded) {
    elements.chartStatus.textContent = chartResourcesLoading
      ? "Loading Signal K chart resources..."
      : "Chart resources have not loaded yet.";
    return;
  }
  const chart = chooseAutoChart();
  if (!chart) {
    elements.chartStatus.textContent = autoChartList.length
      ? "No chart covers the current map centre."
      : "No Signal K chart resources found.";
    if (autoChartId === "__fallback") return;
    autoChartGroup.clearLayers();
    autoChartLayer = null;
    autoChartId = "__fallback";
    autoChartFallbackLayer = makeAutoChartFallbackLayer();
    autoChartGroup.addLayer(autoChartFallbackLayer);
    keepChartLayersOnTop();
    return;
  }
  elements.chartStatus.textContent = chart.name || chart.description || chart.__autoChartId || "Auto chart selected";
  if (autoChartId === chart.__autoChartId && autoChartLayer && autoChartGroup.hasLayer(autoChartLayer)) {
    keepChartLayersOnTop();
    return;
  }
  autoChartGroup.clearLayers();
  autoChartLayer = makeAutoChartLayer(chart);
  autoChartId = chart.__autoChartId;
  if (autoChartLayer) autoChartGroup.addLayer(autoChartLayer);
  keepChartLayersOnTop();
}

function keepChartLayersOnTop() {
  autoChartGroup?.eachLayer((layer) => layer.setZIndex?.(chartLayerZIndex));
  if (seamarkLayer && map?.hasLayer(seamarkLayer)) {
    seamarkLayer.setZIndex?.(seamarkLayerZIndex);
    seamarkLayer.bringToFront?.();
  }
  if (trackLayer) trackLayer.bringToFront?.();
  if (overlayLayer) overlayLayer.bringToFront?.();
}

function renderIntegrity(state) {
  overlayLayer.clearLayers();
  const trust = state?.trust || "unknown";
  elements.trustBadge.textContent = trust.toUpperCase();
  elements.trustBadge.dataset.trust = trust;
  elements.statusLine.textContent = state?.timestamp ? `Updated ${new Date(state.timestamp).toLocaleTimeString()}` : "No provider state";
  elements.warningText.textContent = state?.reasons?.[0] || "No active GPS integrity warning.";
  const operationalDr = state?.operationalDeadReckoning || state?.deadReckoning || {};
  const integrityDr = state?.integrityDeadReckoning || {};
  elements.fixAge.textContent = operationalDr.ageSeconds == null ? "n/a" : `${Math.round(operationalDr.ageSeconds)} s`;
  elements.uncertainty.textContent =
    operationalDr.uncertaintyRadiusMeters == null ? "n/a" : `${Math.round(operationalDr.uncertaintyRadiusMeters)} m`;
  elements.drSource.textContent = operationalDr.source || "n/a";
  elements.hdop.textContent = state?.gps?.hdop ?? "n/a";

  const gps = state?.gps?.position;
  const dr = operationalDr.position;
  const integrityPosition = integrityDr.position;
  updateOperationalTrack(ownshipFollowPosition(state), state?.timestamp);
  if (gps) addPoint(gps, "gps", "GPS");
  if (dr && shouldDrawOperationalDr(gps, dr, state)) {
    addPoint(dr, "dr", "DR");
    if (operationalDr.uncertaintyRadiusMeters) {
      L.circle([dr.latitude, dr.longitude], {
        radius: operationalDr.uncertaintyRadiusMeters,
        color: colorForTrust(trust),
        fillColor: colorForTrust(trust),
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(overlayLayer);
    }
  }
  if (shouldDrawIntegrityDr(state, gps, dr, integrityPosition)) {
    addPoint(integrityPosition, "integrity-dr", "IDR");
    if (integrityDr.uncertaintyRadiusMeters) {
      L.circle([integrityPosition.latitude, integrityPosition.longitude], {
        radius: integrityDr.uncertaintyRadiusMeters,
        color: "#f97316",
        fillColor: "#f97316",
        fillOpacity: 0.1,
        weight: 2,
        dashArray: "7 5",
      }).addTo(overlayLayer);
    }
  }
  if (dr) {
    drawVectors(dr, state.vectors || {});
  }
  followOwnshipIfEnabled(state);
  keepChartLayersOnTop();
}

function shouldDrawOperationalDr(gps, dr, state) {
  if (!gps) return true;
  if (state?.acceptedGps === false) return true;
  return distanceMeters(gps, dr) > 5;
}

function shouldDrawIntegrityDr(state, gps, dr, integrityPosition) {
  if (!integrityPosition || !gps || state?.trust === "lost") return false;
  const comparisonPosition = dr || gps;
  return distanceMeters(comparisonPosition, integrityPosition) > 8;
}

function followOwnshipIfEnabled(state) {
  if (!mapFollowSelf || !map) return;
  const position = ownshipFollowPosition(state);
  if (!position) return;
  disableMapFollowPause = true;
  try {
    map.panTo([position.latitude, position.longitude], { animate: false });
    updateAutoChart();
  } finally {
    disableMapFollowPause = false;
  }
}

function ownshipFollowPosition(state) {
  return (
    state?.operationalDeadReckoning?.position ||
    state?.deadReckoning?.position ||
    state?.gps?.position ||
    null
  );
}

function pauseMapFollowFromUserAction() {
  if (!disableMapFollowPause) setMapFollowSelf(false);
}

function setMapFollowSelf(enabled) {
  mapFollowSelf = Boolean(enabled);
  updateControlButtonStates();
}

function recenterOnOwnship() {
  const position = ownshipFollowPosition(latestStatus?.ajrmMarineGpsIntegrity);
  if (!position || !map) return;
  setMapFollowSelf(true);
  disableMapFollowPause = true;
  try {
    map.panTo([position.latitude, position.longitude], { animate: false });
    if (map.getZoom() < 13) map.setZoom(13, { animate: false });
    updateAutoChart();
  } finally {
    disableMapFollowPause = false;
  }
}

function updateControlButtonStates() {
  elements.toggleStatus.setAttribute("aria-pressed", String(elements.statusDrawer.classList.contains("open")));
  elements.toggleCharts.setAttribute("aria-pressed", String(elements.chartDrawer.classList.contains("open")));
  elements.centreOwnship.setAttribute("aria-pressed", String(mapFollowSelf));
  elements.centreOwnship.classList.toggle("following", mapFollowSelf);
  elements.centreOwnship.classList.toggle("paused", !mapFollowSelf);
  elements.centreOwnship.title = mapFollowSelf ? "Following own vessel" : "Follow paused. Click to centre own vessel";
  elements.centreOwnship.setAttribute("aria-label", elements.centreOwnship.title);
}

function updateOperationalTrack(position, timestamp) {
  if (!position || !trackLayer) return;
  const last = operationalTrack[operationalTrack.length - 1];
  if (last && distanceMeters(last, position) < 2) return;
  operationalTrack.push({
    latitude: position.latitude,
    longitude: position.longitude,
    timestamp: timestamp || new Date().toISOString(),
  });
  if (operationalTrack.length > maxTrackPoints) {
    operationalTrack = operationalTrack.slice(operationalTrack.length - maxTrackPoints);
  }
  saveOperationalTrack();
  redrawOperationalTrack();
}

function loadOperationalTrack() {
  const sessionStartedAt = latestStatus?.startedAt || null;
  operationalTrackStartedAt = sessionStartedAt;
  try {
    const parsed = JSON.parse(localStorage.getItem(trackStorageKey) || "null");
    if (!parsed || parsed.startedAt !== sessionStartedAt || !Array.isArray(parsed.points)) {
      operationalTrack = [];
      saveOperationalTrack();
      return;
    }
    operationalTrack = normalizeTrackPoints(parsed.points);
  } catch {
    operationalTrack = [];
    saveOperationalTrack();
  }
}

function saveOperationalTrack() {
  try {
    localStorage.setItem(
      trackStorageKey,
      JSON.stringify({
        startedAt: operationalTrackStartedAt,
        points: operationalTrack.slice(-maxTrackPoints),
      }),
    );
  } catch (_error) {
    // Ignore storage quota/private-mode failures; live plotting should continue.
  }
}

function syncOperationalTrackSession(startedAt) {
  const sessionStartedAt = startedAt || null;
  if (operationalTrackStartedAt === sessionStartedAt) return;
  loadOperationalTrack();
  if (trackLayer) redrawOperationalTrack();
}

function normalizeTrackPoints(points) {
  return points
    .map((point) => ({
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      timestamp: typeof point.timestamp === "string" ? point.timestamp : null,
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .slice(-maxTrackPoints);
}

function redrawOperationalTrack() {
  trackLayer.clearLayers();
  if (operationalTrack.length < 2) return;
  L.polyline(operationalTrack.map((point) => [point.latitude, point.longitude]), {
    color: "#0f172a",
    weight: 3,
    opacity: 0.58,
    dashArray: "2 8",
    lineCap: "round",
  }).addTo(trackLayer);
}

function addPoint(position, className, label) {
  const marker = L.divIcon({
    className: `own-marker ${className}`,
    html: `<span>${label}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
  L.marker([position.latitude, position.longitude], { icon: marker }).addTo(overlayLayer);
}

function drawVectors(origin, vectors) {
  drawVector(origin, vectors.headingThroughWater, "#2563eb", 1);
  drawVector(origin, vectors.courseOverGround, "#7c3aed", 2);
  drawVector(origin, vectors.tide, "#0891b2", 3);
}

function drawVector(origin, vector, color, arrows) {
  if (!vector?.available) return;
  const lengthMeters = Math.max(80, vector.speedMps * 240);
  const end = destination(origin, vector.bearingTrueDegrees, lengthMeters);
  L.polyline([[origin.latitude, origin.longitude], [end.latitude, end.longitude]], {
    color,
    weight: 4,
    opacity: 0.9,
  }).addTo(overlayLayer);
  for (let index = 0; index < arrows; index += 1) {
    const fraction = 0.76 - index * 0.08;
    addArrowHead(origin, end, fraction, color, vector.bearingTrueDegrees);
  }
}

function addArrowHead(origin, end, fraction, color, bearing) {
  const point = {
    latitude: origin.latitude + (end.latitude - origin.latitude) * fraction,
    longitude: origin.longitude + (end.longitude - origin.longitude) * fraction,
  };
  const left = destination(point, bearing + 150, 35);
  const right = destination(point, bearing - 150, 35);
  L.polyline([[left.latitude, left.longitude], [point.latitude, point.longitude], [right.latitude, right.longitude]], {
    color,
    weight: 3,
    opacity: 0.9,
  }).addTo(overlayLayer);
}

function destination(position, bearingDegrees, distanceMeters) {
  const radius = 6371008.8;
  const bearing = bearingDegrees * Math.PI / 180;
  const lat1 = position.latitude * Math.PI / 180;
  const lon1 = position.longitude * Math.PI / 180;
  const angular = distanceMeters / radius;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { latitude: lat2 * 180 / Math.PI, longitude: lon2 * 180 / Math.PI };
}

function distanceMeters(a, b) {
  const radius = 6371008.8;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function colorForTrust(trust) {
  if (trust === "normal") return "#16a34a";
  if (trust === "degraded") return "#ca8a04";
  return "#dc2626";
}

async function refreshStatus() {
  try {
    latestStatus = await requestJson(`${apiBase}/status`);
    if (!map) initMap(latestStatus.defaults);
    else syncOperationalTrackSession(latestStatus.startedAt);
    renderIntegrity(latestStatus.ajrmMarineGpsIntegrity);
  } catch (error) {
    showToast(error.message || "Unable to refresh DR state", true);
  }
}

elements.toggleStatus.addEventListener("click", () => {
  elements.statusDrawer.classList.toggle("open");
  updateControlButtonStates();
});
elements.toggleCharts.addEventListener("click", () => {
  elements.chartDrawer.classList.toggle("open");
  updateControlButtonStates();
});
elements.centreOwnship.addEventListener("click", recenterOnOwnship);
for (const choice of elements.baseMapChoices) {
  choice.addEventListener("change", () => setBaseMap(choice.value));
}
elements.autoCharts.addEventListener("change", () => setAutoChartsEnabled(elements.autoCharts.checked));
elements.openSeaMap.addEventListener("change", () => setOverlay(seamarkLayer, elements.openSeaMap.checked, "ajrmMarineDrPlotterOpenSeaMap"));

refreshStatus();
setInterval(refreshStatus, 1000);

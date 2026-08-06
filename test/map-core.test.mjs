import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("published map core matches the pinned internal release", async () => {
  const [publishedModule, pinnedModule, publishedCss, pinnedCss] = await Promise.all([
    readFile(new URL("../public/ajrm-map-core.mjs", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/@ajrm-marine/map-core/src/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/ajrm-map-core.css", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/@ajrm-marine/map-core/styles/map-core.css", import.meta.url), "utf8"),
  ]);
  assert.equal(publishedModule, pinnedModule);
  assert.equal(publishedCss, pinnedCss);
});

test("map page uses the standard left-side controls with zoom first", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /ajrm-map-core\.css\?v=0\.6\.7/);
  assert.match(html, /type="module" src="\.\/app\.js\?v=0\.6\.10"/);
  assert.match(html, /<header class="topbar" hidden>/);
  assert.match(html, /id="toggleStatus"[^>]+aria-pressed="false"/);
  assert.match(html, /id="statusDrawer" class="drawer drawer-left"/);
  assert.doesNotMatch(html, /id="statusDrawer" class="[^"]*\bopen\b/);
  assert.match(html, /id="chartCycleStatus" class="chart-cycle-status"[^>]+hidden/);
  assert.match(css, /\.drawer-left\s*\{[^}]*left:\s*52px/s);
  assert.match(css, /\.chart-cycle-status\s*\{/);
  assert.match(await readFile(new URL("../public/ajrm-map-core.css", import.meta.url), "utf8"), /\.ajrm-map-actions\{display:flex;flex-direction:column;gap:10px/);
  assert.match(app, /L\.map\(elements\.map, \{ zoomControl: true \}\)/);
  assert.match(app, /MapCore\.createChartSelectorControl/);
  assert.match(app, /MapCore\.createChartCycleControl/);
  assert.match(await readFile(new URL("../public/ajrm-map-core.mjs", import.meta.url), "utf8"), /CHART_CYCLE_SHORTCUT_STORAGE_KEY = "chartCycleShortcut"/);
  assert.match(app, /MapCore\.createActionToolbarControl/);
  assert.match(app, /function showChartCycleStatus\(\)/);
  assert.match(app, /Automatic chart:/);
  assert.match(app, /Chart \$\{Math\.max\(0, index\) \+ 1\} of \$\{candidates\.length\}:/);
  assert.doesNotMatch(app, /position:\s*["']topright["']/);
});

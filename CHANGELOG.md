# Changelog

## 0.5.21

- Hide the independent integrity DR uncertainty circle on the chart. The IDR
  marker still appears when it has separated from the GPS/operational DR track,
  but its growing spoof-check uncertainty no longer looks like a live GPS
  uncertainty alarm while GPS is healthy.

## 0.5.20

- Move GPS-lost and GPS-return plot-fix creation into the Signal K plugin so
  those navigator fixes are recorded even when the browser reloads, is stale, or
  is not the component that first sees the GPS transition.
- Add a resource-style `fixes` representation for persisted navigator fixes,
  using GeoJSON point features with method and chart-symbol metadata. Existing
  `plot-fixes.json` storage and Capture/Voyage Viewer compatibility remain in
  place.
- Record GPS-return fixes at the returned GPS coordinate, not at the current DR
  coordinate.

## 0.5.19

- Add an immediate GPS-return plot fix when GPS recovers after being lost, so
  the chart records the exact position where navigation returned to a trusted
  electronic fix.

## 0.5.18

- Split DR plot-fix symbols and time labels into separate Leaflet markers so
  the symbol marker can be anchored directly on the plotted coordinate without
  label geometry shifting the fix away from the breadcrumb track.

## 0.5.17

- Anchor plot-fix icons with an explicit fixed-size Leaflet icon box, so the
  electronic-fix square centre dot is exactly on the plotted coordinate.

## 0.5.16

- Force a breadcrumb point at the exact coordinate of each current-position DR
  plot fix, so electronic-fix square centres overlay the breadcrumb course
  point instead of being separated by breadcrumb distance filtering.

## 0.5.15

- Make the observed-fix placeholders show symbol-free navigation coordinate
  entry, for example `51N 15' 30.3''`, and keep the parser accepting that form.

## 0.5.14

- Make observed-fix latitude and longitude inputs use the selected coordinate
  display format, defaulting to DMS, while still accepting pasted decimal
  degrees.

## 0.5.13

- Show tide/current in DR plot-fix popups as drift then set, matching the
  speed/direction order used by STW/heading and SOG/COG rows.

## 0.5.12

- Add a configurable latitude/longitude display format, defaulting to degrees,
  minutes, and seconds.
- Add **Get from cursor** for observed fixes: click the button, then click the
  chart to copy that position into the observed-fix fields.
- Show range and bearing from the current DR/GPS position to the cursor in the
  bottom-right coordinate readout.

## 0.5.11

- Add an **Observed fix** control for manually entering a latitude/longitude
  fix from bearings, transits, radar, or another non-GPS source.
- Render observed fixes as dot-in-circle chart symbols and preserve their notes
  in the persisted plot-fix file.

## 0.5.10

- Add a bottom-right cursor readout showing live chart latitude and longitude.
- Add a debugging **Clear all plots** control that clears both the breadcrumb
  track and plotted fixes.

## 0.5.9

- Anchor plotted fix markers directly on the plotted position dot so labels and
  symbol geometry cannot move fixes away from the DR breadcrumb when zooming.
- Add a manual pruning control for old navigator plot fixes while keeping the
  existing hard safety cap of the newest 1000 fixes.

## 0.5.8

- Add the same GPS OK/lost status LED used by AJRM Marine Display to the DR
  Plotter chart controls.

## 0.5.7

- Anchor plotted fix symbols on their centre dot so Estimated Position and
  Electronic Fix markers stay aligned with the breadcrumb track during zoom.

## 0.5.6

- Render GPS-lost plot fixes as Estimated Position triangle symbols, while
  GPS-derived plot fixes use Electronic Fix square symbols.

## 0.5.5

- Add persisted DR plot fixes with a configurable automatic interval, manual
  **Plot now** controls, time-labelled chart markers, and navigator popups with
  position, DR source, uncertainty, GPS age/distance, STW/heading, SOG/COG, and
  tide set/drift.
- Automatically drop a plot fix when GPS trust changes to lost.

## 0.5.4

- Declare AJRM Marine GPS Integrity as a required companion app.

## 0.5.3

- Remove obsolete suite naming from package metadata.

## 0.5.2

- Use the same chart selector icon as AJRM Marine Display.

## 0.5.1

- Use the same follow/centre own-vessel icon as AJRM Marine Display, including
  the red slash overlay when map following is paused.

## 0.5.0

- Initial public beta release as AJRM Marine DR Plotter.

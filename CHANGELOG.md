# Changelog

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

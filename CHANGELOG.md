# Changelog

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

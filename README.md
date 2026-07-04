# AJRM Marine DR Plotter

Own-vessel dead-reckoning chart plotter for AJRM Marine GPS Integrity.

Version `0.5.28` publishes the same persistence status under
`vessels.self.plugins.ajrmMarineDrPlotter` so Console BITE, Capture, and
Snapshot can verify it from captured Signal K state.

Version `0.5.27` exposes the server-side plot-fix and breadcrumb persistence
contract in the status endpoint so BITE, Capture, and Voyage Viewer can verify
that navigator fixes and DR tracks survive page changes and are bundle-ready.

Version `0.5.4` declares AJRM Marine GPS Integrity as a required companion app
because DR Plotter renders the dead-reckoning state published by that provider.

Version `0.5.2` uses the same chart selector and follow/centre own-vessel icons
as AJRM Marine Display.

This app is deliberately not an AIS viewer. It does not plot AIS targets, CPA
lines, traffic lists, or target alarms. Its job is to answer one question:

> How much should I trust my own plotted position right now?

The plotter renders:

- GPS fix position when trusted or available.
- Operational dead-reckoning fallback from the GPS Integrity provider. This is
  normally hidden while it sits directly on top of accepted GPS, then appears
  when GPS is unavailable or the position separates.
- Independent integrity dead reckoning from the GPS Integrity provider, shown as
  a separate marker when it separates enough to matter for spoof/drift testing.
- Operational uncertainty circles that expand as confidence drops or the active
  DR track ages.
- Single-arrow heading/STW vector.
- Double-arrow COG/SOG vector.
- Triple-arrow tide/current vector.
- Persisted navigator fixes, labelled with plot time, including automatic timed
  fixes, manual **Plot now** fixes, an immediate Estimated Position when GPS is
  lost, and an immediate Electronic Fix when GPS returns. GPS-lost plot fixes
  are shown as Estimated Position triangle symbols; GPS-derived plot fixes are
  shown as Electronic Fix square symbols. Timed and GPS-transition fixes are
  authored by the Signal K plugin, not by the browser, so they are recorded even
  when no DR Plotter page is open. Fixes are stored on the Signal K server,
  capped to the newest 1000 records, shared by every display device, and can be
  manually pruned by age after they have been captured in a voyage bundle.
- Colour-coded GPS trust state and warnings.

Chart controls follow the same lightweight model as Voyage Viewer: offline
Natural Earth, optional online basemaps, OpenSeaMap seamarks, and Auto Charts
from Signal K chart resources.

## Provider

Install and enable `signalk-ajrm-marine-gps-integrity` alongside this app. Signal K
servers that support AppStore dependencies can install it from DR Plotter's
`signalk.requires` metadata. DR Plotter reads:

`vessels.self.plugins.ajrmMarineGpsIntegrity.navigationIntegrity`

Safety decisions stay in that provider. This webapp only renders the provider's
state on a chart.

## Fix Resources

Navigator fixes are not stored as Signal K notes. DR Plotter keeps the existing
`plot-fixes.json` file for Capture and Voyage Viewer compatibility, and also
exposes the same records from `/plugins/signalk-ajrm-marine-dr-plotter/fixes`
as GeoJSON-style `fixes` resources. Each fix records its method, chart symbol,
timestamp, position, DR context, uncertainty, and available speed/heading/current
data so the model can later be promoted to a shared Signal K resource type.


## Public Beta

Dead-reckoning chart plotter for AJRM Marine Suite GPS degradation testing.

Development assistance: OpenAI Codex helped with code generation, refactoring, and automated testing during the beta development cycle.
## License and commercial use

This software is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). You may use, study, share, and modify it under that licence. If you modify it and make it available to users over a network, the corresponding source code must also be made available under the AGPL.

Commercial licensing is available by arrangement for organisations that want different terms.

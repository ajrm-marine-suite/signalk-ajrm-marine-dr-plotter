# AJRM Marine DR Plotter

Own-vessel dead-reckoning chart plotter for AJRM Marine GPS Integrity.

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
- Independent integrity dead reckoning from the GPS Integrity provider, with a
  separate colour and uncertainty circle for spoof/drift testing.
- Uncertainty circles that expand as confidence drops or each DR track ages.
- Single-arrow heading/STW vector.
- Double-arrow COG/SOG vector.
- Triple-arrow tide/current vector.
- Persisted DR plot fixes, labelled with plot time, including automatic timed
  fixes, manual **Plot now** fixes, and an immediate fix when GPS becomes lost.
  GPS-lost plot fixes are shown as Estimated Position triangle symbols; GPS
  derived plot fixes are shown as Electronic Fix square symbols.
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


## Public Beta

Dead-reckoning chart plotter for AJRM Marine Suite GPS degradation testing.

Development assistance: OpenAI Codex helped with code generation, refactoring, and automated testing during the beta development cycle.

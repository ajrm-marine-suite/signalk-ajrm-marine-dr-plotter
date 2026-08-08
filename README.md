# AJRM Marine DR Plotter (retired)

This package was retired in version 0.8.0. The operational dead-reckoning
plotter is now built into **AJRM Marine Navigation Integrity 0.8.0 or later**
(package name `signalk-ajrm-marine-gps-integrity`).

The combined plug-in preserves the existing DR Plotter data directory,
settings, Signal K state path, fixes, track, routes, and web API. Open it from
**AJRM Marine Navigation Integrity → DR Plotter**. Do not run this standalone
package at the same time.

## Migration

```bash
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-gps-integrity.git#v0.8.0 --omit=dev --no-package-lock
npm uninstall signalk-ajrm-marine-dr-plotter --no-package-lock
sudo systemctl restart signalk
```

## License

AGPL-3.0-or-later.

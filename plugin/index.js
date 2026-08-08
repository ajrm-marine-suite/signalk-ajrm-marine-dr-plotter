"use strict";

const packageInfo = require("../package.json");

module.exports = function retiredDrPlotter(app) {
  return {
    id: "signalk-ajrm-marine-dr-plotter",
    name: "AJRM Marine DR Plotter (retired)",
    description:
      "Retired in v0.8.0. DR Plotter is built into AJRM Marine Navigation Integrity.",
    schema: { type: "object", properties: {} },
    start() {
      const message =
        `DR Plotter v${packageInfo.version} is retired; install AJRM Marine Navigation Integrity v0.8.0 or later`;
      app.setPluginError?.(message);
      app.setPluginStatus?.(message);
    },
    stop() {},
  };
};

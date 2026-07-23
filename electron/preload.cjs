const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("cflowDesktop", {
  platform: process.platform,
  version: "0.1.0",
  runtime: "electron-secure-shell",
});

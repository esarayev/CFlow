const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cflowDesktop", {
  platform: process.platform,
  version: "0.1.0",
  runtime: "electron-secure-shell",
});

contextBridge.exposeInMainWorld("cflowUsers", {
  list: () => ipcRenderer.invoke("cflow-users:list"),
  authenticate: (username, password) => ipcRenderer.invoke("cflow-users:auth", { username, password }),
  create: (user) => ipcRenderer.invoke("cflow-users:create", user),
  update: (user) => ipcRenderer.invoke("cflow-users:update", user),
  delete: (userId) => ipcRenderer.invoke("cflow-users:delete", { userId }),
});

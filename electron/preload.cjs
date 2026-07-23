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

contextBridge.exposeInMainWorld("cflowData", {
  snapshot: () => ipcRenderer.invoke("cflow-data:snapshot"),
  receiveBox: (payload) => ipcRenderer.invoke("cflow-data:receive-box", payload),
  moveBox: (payload) => ipcRenderer.invoke("cflow-data:move-box", payload),
  issueBox: (payload) => ipcRenderer.invoke("cflow-data:issue-box", payload),
  updateStatus: (payload) => ipcRenderer.invoke("cflow-data:update-status", payload),
  problemBox: (payload) => ipcRenderer.invoke("cflow-data:problem-box", payload),
  createClient: (payload) => ipcRenderer.invoke("cflow-data:create-client", payload),
  createShipment: (payload) => ipcRenderer.invoke("cflow-data:create-shipment", payload),
  recordPayment: (payload) => ipcRenderer.invoke("cflow-data:record-payment", payload),
  deleteBox: (payload) => ipcRenderer.invoke("cflow-data:delete-box", payload),
});

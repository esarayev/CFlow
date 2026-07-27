const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cflowDesktop", {
  platform: process.platform,
  version: "0.1.0",
  runtime: "electron-secure-shell",
});

contextBridge.exposeInMainWorld("cflowUsers", {
  list: (payload) => ipcRenderer.invoke("cflow-users:list", payload),
  authenticate: (username, password) => ipcRenderer.invoke("cflow-users:auth", { username, password }),
  create: (user) => ipcRenderer.invoke("cflow-users:create", user),
  update: (user) => ipcRenderer.invoke("cflow-users:update", user),
  delete: (userId) => ipcRenderer.invoke("cflow-users:delete", { userId }),
});

contextBridge.exposeInMainWorld("cflowData", {
  snapshot: (payload) => ipcRenderer.invoke("cflow-data:snapshot", payload),
  createBackup: (payload) => ipcRenderer.invoke("cflow-data:create-backup", payload),
  receiveBox: (payload) => ipcRenderer.invoke("cflow-data:receive-box", payload),
  scanClientQr: (payload) => ipcRenderer.invoke("cflow-data:scan-client-qr", payload),
  scanBoxCode: (payload) => ipcRenderer.invoke("cflow-data:scan-box-code", payload),
  acceptScannedBox: (payload) => ipcRenderer.invoke("cflow-data:accept-scanned-box", payload),
  issueScannedBox: (payload) => ipcRenderer.invoke("cflow-data:issue-scanned-box", payload),
  moveBox: (payload) => ipcRenderer.invoke("cflow-data:move-box", payload),
  issueBox: (payload) => ipcRenderer.invoke("cflow-data:issue-box", payload),
  updateStatus: (payload) => ipcRenderer.invoke("cflow-data:update-status", payload),
  problemBox: (payload) => ipcRenderer.invoke("cflow-data:problem-box", payload),
  createClient: (payload) => ipcRenderer.invoke("cflow-data:create-client", payload),
  addClientCodes: (payload) => ipcRenderer.invoke("cflow-data:add-client-codes", payload),
  saveWarehouseAddress: (payload) => ipcRenderer.invoke("cflow-data:save-warehouse-address", payload),
  issueClientCode: (payload) => ipcRenderer.invoke("cflow-data:issue-client-code", payload),
  createInvoice: (payload) => ipcRenderer.invoke("cflow-data:create-invoice", payload),
  confirmInvoice: (payload) => ipcRenderer.invoke("cflow-data:confirm-invoice", payload),
  arriveInvoice: (payload) => ipcRenderer.invoke("cflow-data:arrive-invoice", payload),
  notifyInvoice: (payload) => ipcRenderer.invoke("cflow-data:notify-invoice", payload),
  createShipment: (payload) => ipcRenderer.invoke("cflow-data:create-shipment", payload),
  recordPayment: (payload) => ipcRenderer.invoke("cflow-data:record-payment", payload),
  deleteBox: (payload) => ipcRenderer.invoke("cflow-data:delete-box", payload),
  deleteClient: (payload) => ipcRenderer.invoke("cflow-data:delete-client", payload),
  currencyRates: (payload) => ipcRenderer.invoke("cflow-data:currency-rates", payload),
});

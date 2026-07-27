const { app, BrowserWindow, shell, ipcMain, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { registerCflowIpc, startBackupScheduler } = require("./cflow-store.cjs");
const { registerUserIpc } = require("./users-store.cjs");

const isDev = !app.isPackaged;
const packagedAppPath = path.join(app.getAppPath(), "out", "index.html");
const appUrl = process.env.CFLOW_APP_URL || (isDev ? "http://localhost:3000" : pathToFileURL(packagedAppPath).toString());
const allowedOrigins = new Set([
  "http://localhost:3000",
  "https://cflow-miniapp.yegor-sarayev.workers.dev",
]);

function isAllowedUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === "file:") {
      return true;
    }
    return allowedOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "Zabota Cargo",
    autoHideMenuBar: true,
    backgroundColor: "#f8f6f3",
    icon: path.join(app.getAppPath(), "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      return { action: "allow" };
    }

    shell.openExternal(url).catch(() => undefined);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(appUrl);
}

app.whenReady().then(() => {
  registerCflowIpc(ipcMain, app);
  registerUserIpc(ipcMain, app);
  startBackupScheduler(app);

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("certificate-error", (event, _webContents, _url, _error, _certificate, callback) => {
  event.preventDefault();
  callback(false);
});

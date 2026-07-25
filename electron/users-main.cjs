const { app, BrowserWindow, shell, ipcMain, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { registerUserIpc } = require("./users-store.cjs");

const isDev = !app.isPackaged;
const packagedAppPath = path.join(app.getAppPath(), "out", "users.html");
const appUrl = process.env.CFLOW_USERS_APP_URL || (isDev ? "http://localhost:3000/users" : pathToFileURL(packagedAppPath).toString());

function isAllowedUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === "file:" || parsed.origin === "http://localhost:3000";
  } catch {
    return false;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "Zabota Cargo Пользователи",
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
    if (isAllowedUrl(url)) return { action: "allow" };
    shell.openExternal(url).catch(() => undefined);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) event.preventDefault();
  });

  mainWindow.loadURL(appUrl);
}

app.whenReady().then(() => {
  registerUserIpc(ipcMain, app);

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("certificate-error", (event, _webContents, _url, _error, _certificate, callback) => {
  event.preventDefault();
  callback(false);
});

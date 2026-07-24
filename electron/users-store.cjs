const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ownerUsername = "esaraev85";
const ownerPassword = "Q1w2e3r4!";

const ownerUser = {
  id: "USR-001",
  name: "Администратор",
  username: ownerUsername,
  role: "Руководитель",
  permissions: ["all"],
  status: "active",
};

const activeSessions = new Map();
const sessionTtlMs = 12 * 60 * 60 * 1000;

function dataDir(app) {
  return path.join(app.getPath("appData"), "CFlow");
}

function storePath(app) {
  return path.join(dataDir(app), "users.json");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, expected] = String(passwordHash || "").split(":");
  if (!salt || !expected) return false;

  const actual = crypto.scryptSync(String(password || ""), salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (expectedBuffer.length !== actual.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, actual);
}

function normalizeRole(role) {
  const value = String(role || "").trim();
  const map = new Map([
    ["Руководитель", "Руководитель"],
    ["Администратор", "Руководитель"],
    ["Менеджер", "Менеджер"],
    ["Кладовщик", "Кладовщик"],
    ["Финансы", "Финансы"],
    ["Оператор", "Оператор"],
    ["Р СѓРєРѕРІРѕРґРёС‚РµР»СЊ", "Руководитель"],
    ["РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ", "Руководитель"],
    ["РњРµРЅРµРґР¶РµСЂ", "Менеджер"],
    ["РљР»Р°РґРѕРІС‰РёРє", "Кладовщик"],
    ["Р¤РёРЅР°РЅСЃС‹", "Финансы"],
    ["РћРїРµСЂР°С‚РѕСЂ", "Оператор"],
  ]);
  return map.get(value) || "Менеджер";
}

function rolePermissions(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "Руководитель") return ["all"];
  if (normalizedRole === "Менеджер") return ["receive_box", "issue_box", "search", "clients", "warehouse"];
  if (normalizedRole === "Кладовщик") return ["receive_box", "move_box", "issue_box", "warehouse"];
  if (normalizedRole === "Финансы") return ["finance", "reports", "search"];
  return ["receive_box", "issue_box", "search"];
}

function normalizeStatus(status) {
  const value = String(status || "").trim();
  if (!value) return "active";
  if (value === "active" || value === "disabled") return value;
  if (value === "Активен" || value === "РђРєС‚РёРІРµРЅ") return "active";
  if (value === "Отключен" || value === "РћС‚РєР»СЋС‡РµРЅ") return "disabled";
  return "active";
}

function normalizeName(user) {
  const name = String(user.name || "").trim();
  if (!name || name === "Ержан Сараев" || name === "Р•СЂР¶Р°РЅ РЎР°СЂР°РµРІ" || name === "РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ") {
    return "Администратор";
  }
  return name;
}

function normalizeUser(user) {
  const normalized = { ...user };
  normalized.status = normalizeStatus(normalized.status);
  normalized.role = normalizeRole(normalized.role);

  if (normalized.username === ownerUsername) {
    normalized.id = ownerUser.id;
    normalized.name = normalizeName(normalized);
    normalized.role = ownerUser.role;
    normalized.permissions = ownerUser.permissions;
    normalized.status = "active";
  }

  if (!Array.isArray(normalized.permissions) || normalized.permissions.length === 0) {
    normalized.permissions = rolePermissions(normalized.role);
  }

  return normalized;
}

function publicUser(user) {
  const normalized = normalizeUser(user);
  const { passwordHash: _passwordHash, ...safeUser } = normalized;
  return {
    ...safeUser,
    statusLabel: normalized.status === "active" ? "Активен" : "Отключен",
  };
}

function createSession(user) {
  const normalized = normalizeUser(user);
  const token = crypto.randomUUID();
  activeSessions.set(token, {
    token,
    userId: normalized.id,
    username: normalized.username,
    permissions: normalized.permissions,
    expiresAt: Date.now() + sessionTtlMs,
  });
  return token;
}

function validateSession(app, sessionToken, permission = "search") {
  const token = String(sessionToken || "");
  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) activeSessions.delete(token);
    return { ok: false, error: "РЎРµСЃСЃРёСЏ РёСЃС‚РµРєР»Р°. Р’РѕР№РґРёС‚Рµ РІ CFlow Р·Р°РЅРѕРІРѕ." };
  }

  const user = readUsers(app).find((item) => item.id === session.userId && item.status === "active");
  if (!user) {
    activeSessions.delete(token);
    return { ok: false, error: "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµР°РєС‚РёРІРµРЅ. Р’РѕР№РґРёС‚Рµ Р·Р°РЅРѕРІРѕ." };
  }

  const permissions = normalizeUser(user).permissions || [];
  if (!permissions.includes("all") && permission && !permissions.includes(permission)) {
    return { ok: false, error: "РќРµС‚ РїСЂР°РІ РЅР° СЌС‚Рѕ РґРµР№СЃС‚РІРёРµ" };
  }

  session.expiresAt = Date.now() + sessionTtlMs;
  return { ok: true, user: publicUser(user) };
}

function ensureStore(app) {
  fs.mkdirSync(dataDir(app), { recursive: true });
  const file = storePath(app);
  if (!fs.existsSync(file)) {
    const users = [{ ...ownerUser, passwordHash: hashPassword(ownerPassword) }];
    fs.writeFileSync(file, JSON.stringify({ users }, null, 2), "utf8");
  }
}

function writeUsers(app, users) {
  ensureStore(app);
  fs.writeFileSync(storePath(app), JSON.stringify({ users: users.map(normalizeUser) }, null, 2), "utf8");
}

function readStoreJson(app) {
  const raw = fs.readFileSync(storePath(app), "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function readUsers(app) {
  ensureStore(app);

  const parsed = readStoreJson(app);
  const users = Array.isArray(parsed.users) ? parsed.users.map(normalizeUser) : [];
  const owner = users.find((user) => user.username === ownerUsername);

  if (!owner) {
    users.unshift({ ...ownerUser, passwordHash: hashPassword(ownerPassword) });
    writeUsers(app, users);
    return users;
  }

  if (!owner.passwordHash) owner.passwordHash = hashPassword(ownerPassword);
  writeUsers(app, users);
  return users;
}

function listUsers(app) {
  return readUsers(app).map(publicUser);
}

function authenticate(app, username, password) {
  try {
    const cleanUsername = String(username || "").trim();
    const user = readUsers(app).find((item) => item.username === cleanUsername && item.status === "active");

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { ok: false, error: "Неверный логин или пароль" };
    }

    return { ok: true, user: publicUser(user), sessionToken: createSession(user) };
  } catch {
    return { ok: false, error: "База пользователей повреждена. Перезапустите приложение." };
  }
}

function createUser(app, input) {
  const users = readUsers(app);
  const username = String(input.username || "").trim();
  const name = String(input.name || "").trim();
  const password = String(input.password || "");
  const role = normalizeRole(input.role);

  if (!name || !username || password.length < 6) {
    return { ok: false, error: "Укажите имя, логин и пароль минимум 6 символов" };
  }

  if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: "Такой логин уже существует" };
  }

  const user = {
    id: `USR-${String(users.length + 1).padStart(3, "0")}`,
    name,
    username,
    role,
    permissions: rolePermissions(role),
    status: "active",
    passwordHash: hashPassword(password),
  };

  users.unshift(user);
  writeUsers(app, users);
  return { ok: true, user: publicUser(user), users: users.map(publicUser) };
}

function updateUser(app, input) {
  const users = readUsers(app);
  const userId = String(input.id || "");
  const index = users.findIndex((item) => item.id === userId);

  if (index === -1) {
    return { ok: false, error: "Пользователь не найден" };
  }

  const current = users[index];
  const isOwner = current.username === ownerUsername;
  const name = String(input.name || "").trim();
  const username = isOwner ? current.username : String(input.username || "").trim();
  const role = isOwner ? ownerUser.role : normalizeRole(input.role || current.role);
  const password = String(input.password || "");

  if (!name || !username) {
    return { ok: false, error: "Укажите имя и логин" };
  }

  if (users.some((user) => user.id !== userId && user.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: "Такой логин уже существует" };
  }

  users[index] = {
    ...current,
    id: isOwner ? ownerUser.id : current.id,
    name,
    username,
    role,
    permissions: rolePermissions(role),
    status: isOwner ? "active" : normalizeStatus(current.status),
    passwordHash: password ? hashPassword(password) : current.passwordHash,
  };

  writeUsers(app, users);
  return { ok: true, user: publicUser(users[index]), users: users.map(publicUser) };
}

function deleteUser(app, userId) {
  const users = readUsers(app);
  const user = users.find((item) => item.id === userId);

  if (!user) {
    return { ok: false, error: "Пользователь не найден" };
  }

  if (user.username === ownerUsername) {
    return { ok: false, error: "Нельзя удалить владельца кабинета. Можно изменить имя и пароль." };
  }

  const nextUsers = users.filter((item) => item.id !== userId);
  writeUsers(app, nextUsers);
  return { ok: true, users: nextUsers.map(publicUser) };
}

function registerUserIpc(ipcMain, app) {
  ipcMain.handle("cflow-users:list", () => listUsers(app));
  ipcMain.handle("cflow-users:auth", (_event, payload) =>
    authenticate(app, payload?.username, payload?.password),
  );
  ipcMain.handle("cflow-users:create", (_event, payload) => createUser(app, payload));
  ipcMain.handle("cflow-users:update", (_event, payload) => updateUser(app, payload));
  ipcMain.handle("cflow-users:delete", (_event, payload) => deleteUser(app, payload?.userId));
}

module.exports = {
  registerUserIpc,
  validateSession,
};

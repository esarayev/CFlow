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

function dataDir(app) {
  return path.join(app.getPath("appData"), "CFlow");
}

function storePath(app) {
  return path.join(dataDir(app), "users.json");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
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

function rolePermissions(role) {
  if (role === "Руководитель") return ["all"];
  if (role === "Администратор") return ["users", "boxes", "warehouse", "shipments", "finance"];
  if (role === "Менеджер") return ["receive_box", "issue_box", "search", "clients", "warehouse"];
  if (role === "Кладовщик") return ["receive_box", "move_box", "issue_box", "warehouse"];
  if (role === "Финансы") return ["finance", "reports", "search"];
  return ["receive_box", "issue_box", "search"];
}

function normalizeStatus(status) {
  if (!status) return "active";
  if (status === "active" || status === "disabled") return status;
  if (status === "Активен" || status === "РђРєС‚РёРІРµРЅ") return "active";
  if (status === "Отключен" || status === "РћС‚РєР»СЋС‡РµРЅ") return "disabled";
  return "active";
}

function normalizeUser(user) {
  const normalized = { ...user };

  if (normalized.username === ownerUsername) {
    normalized.id = ownerUser.id;
    normalized.name = normalized.name && normalized.name !== "Ержан Сараев" && normalized.name !== "Р•СЂР¶Р°РЅ РЎР°СЂР°РµРІ"
      ? normalized.name
      : ownerUser.name;
    normalized.role = ownerUser.role;
    normalized.permissions = ownerUser.permissions;
    normalized.status = "active";
  }

  normalized.status = normalizeStatus(normalized.status);
  if (!Array.isArray(normalized.permissions)) normalized.permissions = rolePermissions(normalized.role);
  if (!normalized.role) normalized.role = "Менеджер";

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

    return { ok: true, user: publicUser(user) };
  } catch {
    return { ok: false, error: "База пользователей повреждена. Перезапустите приложение." };
  }
}

function createUser(app, input) {
  const users = readUsers(app);
  const username = String(input.username || "").trim();
  const name = String(input.name || "").trim();
  const password = String(input.password || "");
  const role = String(input.role || "Менеджер");

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
  const role = isOwner ? ownerUser.role : String(input.role || current.role);
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
};

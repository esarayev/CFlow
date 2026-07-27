import handler from "vinext/server/app-router-entry";

interface Env {
  DB?: D1Database;
  CFLOW_TELEGRAM_BOT_TOKEN?: string;
  CFLOW_MANAGE_TELEGRAM_BOT_TOKEN?: string;
  CFLOW_MANAGE_ALLOWED_TELEGRAM_USERNAMES?: string;
  CFLOW_ADMIN_TOKEN?: string;
  CFLOW_TELEGRAM_WEBAPP_URL?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type RegistrationSource = "manual" | "telegram";
type RegistrationStatus = "pending" | "approved" | "rejected";
type BroadcastAudience = "approved" | "telegram" | "pending";

type CflowClient = {
  id: string;
  name: string;
  phone: string;
  telegram_username: string;
  telegram_id: string;
  comments: string;
  client_code: string;
  china_address: string;
  client_rate: number;
  china_rate: number;
  registration_source: RegistrationSource;
  registration_status: RegistrationStatus;
  created_at: string;
  updated_at: string;
};

type CflowBox = {
  id: string;
  client_id: string;
  client_code: string;
  phone: string;
  telegram_id: string;
  track: string;
  status: string;
  updated_at: string;
  payload: string;
};

type CflowStoredEntity = {
  id: string;
  updated_at: string;
  payload: string;
};

type CflowStaff = {
  id: string;
  name: string;
  username: string;
  telegram_username: string;
  role: string;
  permissions: string;
  status: string;
  updated_at: string;
  payload: string;
};

type CflowClientCode = {
  id: string;
  code: string;
  status: "available" | "assigned";
  client_id: string;
  client_name: string;
  assigned_at: string;
  created_at: string;
  updated_at: string;
};

type CflowTombstone = {
  id: string;
  reason: string;
  deleted_at: string;
};

type CflowBackup = {
  id: string;
  reason: string;
  created_at: string;
  checksum: string;
  payload: string;
};

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
  };
};

const memoryClients = new Map<string, CflowClient>();
const memoryBoxes = new Map<string, CflowBox>();
const memoryShipments = new Map<string, CflowStoredEntity>();
const memoryActivity = new Map<string, CflowStoredEntity>();
const memoryInvoices = new Map<string, CflowStoredEntity>();
const memoryStaff = new Map<string, CflowStaff>();
const memoryClientCodes = new Map<string, CflowClientCode>();
const memorySettings = new Map<string, string>();
const memoryDeletedBoxes = new Map<string, CflowTombstone>();
const memoryDeletedClients = new Map<string, CflowTombstone>();
const memoryBackups = new Map<string, CflowBackup>();

const CLIENT_CODE_STATIC_PREFIX = "奇瑞QR";
const CLIENT_CODE_LEGACY_STATIC_PREFIX = "奇瑞QR 18911759229";
const CLIENT_CODE_CITY_PREFIX = "AST";
const CLIENT_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CLIENT_CODE_MAX_NUMBER = 999;
const CLIENT_CODE_CAPACITY = CLIENT_CODE_ALPHABET.length * CLIENT_CODE_MAX_NUMBER;
const DEFAULT_CHINA_ADDRESS = "18911759229 浙江省金华市义乌市后宅街道金城一期商城大道F158号拼多多驿站-5697库-奇瑞";
let ensureTablesPromise: Promise<void> | null = null;

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init.headers || {}) },
  });
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

async function signClaimPayload(env: Env, payload: string) {
  const secret = env.CFLOW_ADMIN_TOKEN;
  if (!secret) throw new Error("CFLOW_ADMIN_TOKEN is required for QR claim signing");
  const signature = await hmac(new TextEncoder().encode(secret), payload);
  return hex(signature).slice(0, 32);
}

async function createClaimToken(env: Env, payload: Record<string, unknown>) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await signClaimPayload(env, encoded);
  return `ZBC:CLAIM:v1:${encoded}.${signature}`;
}

const russianKeyboardToEnglish: Record<string, string> = {
  й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p", х: "[", ъ: "]",
  ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k", д: "l", ж: ";", э: "'",
  я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m", б: ",", ю: ".", ".": "/",
  Й: "Q", Ц: "W", У: "E", К: "R", Е: "T", Н: "Y", Г: "U", Ш: "I", Щ: "O", З: "P", Х: "{", Ъ: "}",
  Ф: "A", Ы: "S", В: "D", А: "F", П: "G", Р: "H", О: "J", Л: "K", Д: "L", Ж: ":", Э: "\"",
  Я: "Z", Ч: "X", С: "C", М: "V", И: "B", Т: "N", Ь: "M", Б: "<", Ю: ">", ",": "?",
};

function normalizeScannedClaimToken(token: string) {
  const cleanToken = String(token || "").trim();
  if (cleanToken.startsWith("ZBC:CLAIM:v1:")) return cleanToken;
  return cleanToken.replace(/[А-Яа-яЁё.,]/g, (char) => russianKeyboardToEnglish[char] || char);
}

async function verifyClaimToken(env: Env, token: string) {
  const cleanToken = normalizeScannedClaimToken(String(token || ""));
  const prefix = "ZBC:CLAIM:v1:";
  if (!cleanToken.startsWith(prefix)) return { ok: false as const, error: "Это не QR Zabota GO" };
  const [encoded, signature] = cleanToken.slice(prefix.length).split(".");
  if (!encoded || !signature) return { ok: false as const, error: "QR поврежден" };
  const expected = await signClaimPayload(env, encoded);
  if (signature !== expected) return { ok: false as const, error: "QR недействителен или поврежден" };
  try {
    return { ok: true as const, payload: JSON.parse(base64UrlDecode(encoded)) as Record<string, unknown> };
  } catch {
    return { ok: false as const, error: "QR поврежден" };
  }
}

function normalizeId(value = "") {
  return String(value || "").trim();
}

function isCorruptText(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/[\uFFFD]/.test(text)) return true;
  if (/[РС][\u0080-\u00BF]/.test(text)) return true;
  const questionMarks = (text.match(/\?/g) || []).length;
  return questionMarks >= 2 && questionMarks / text.length > 0.2;
}

function cleanName(value: unknown, fallback = "") {
  const name = String(value || "").trim();
  return name && !isCorruptText(name) ? name : fallback;
}

function codeSuffixFromIndex(index: number) {
  const letter = CLIENT_CODE_ALPHABET[Math.floor(index / CLIENT_CODE_MAX_NUMBER)];
  const number = (index % CLIENT_CODE_MAX_NUMBER) + 1;
  if (!letter) return "";
  return `${CLIENT_CODE_CITY_PREFIX} ${letter}${String(number).padStart(3, "0")}`;
}

function fullClientCodeFromIndex(index: number) {
  const suffix = codeSuffixFromIndex(index);
  return suffix ? `${CLIENT_CODE_STATIC_PREFIX} ${suffix}` : "";
}

function normalizeGeneratedClientCode(value: unknown) {
  const code = String(value || "").trim().replace(/\s+/g, " ");
  if (!code) return "";
  return code.replace(new RegExp(`^${CLIENT_CODE_LEGACY_STATIC_PREFIX}\\s+`, "i"), `${CLIENT_CODE_STATIC_PREFIX} `);
}

function nowIso() {
  return new Date().toISOString();
}

function makeClientId() {
  return `CL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

function makeBoxId() {
  return `CF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

function toNumber(value: unknown) {
  const parsed = Number(String(value || "").replace(/\s+/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInt(value: unknown, fallback = 1, max = 99) {
  const parsed = Math.floor(toNumber(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function packageTrack(item: Record<string, unknown>, invoice: Record<string, unknown>, packageIndex: number, packageTotal: number) {
  const track = String(item.track || "").trim();
  if (packageTotal <= 1) return track || `INV-${String(invoice.number || invoice.id || "").trim()}-${String(item.id || packageIndex)}`;
  return track ? `${track}-${packageIndex}` : `INV-${String(invoice.number || invoice.id || "").trim()}-${String(item.id || "ROW")}-${packageIndex}`;
}

function parsePayload<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeBoxPayload(input: Record<string, unknown>, existing?: CflowBox | null) {
  const existingPayload = existing ? parsePayload<Record<string, unknown>>(existing.payload, {}) : {};
  const now = nowIso();
  const id = String(input.id || existingPayload.id || existing?.id || makeBoxId()).trim();
  return {
    ...existingPayload,
    ...input,
    id,
    clientId: String(input.clientId || existingPayload.clientId || existing?.client_id || "").trim(),
    clientCode: normalizeGeneratedClientCode(input.clientCode || existingPayload.clientCode || existing?.client_code || ""),
    phone: String(input.phone || existingPayload.phone || existing?.phone || "").trim(),
    telegramId: String(input.telegramId || existingPayload.telegramId || existing?.telegram_id || "").trim(),
    track: String(input.track || existingPayload.track || existing?.track || "").trim(),
    status: String(input.status || existingPayload.status || existing?.status || "На складе").trim(),
    createdAt: String(input.createdAt || existingPayload.createdAt || now),
    updatedAt: String(input.updatedAt || now),
  };
}

function toStoredBox(payload: Record<string, unknown>, existing?: CflowBox | null): CflowBox {
  const normalized = normalizeBoxPayload(payload, existing);
  return {
    id: String(normalized.id),
    client_id: String(normalized.clientId || ""),
    client_code: String(normalized.clientCode || ""),
    phone: String(normalized.phone || ""),
    telegram_id: String(normalized.telegramId || ""),
    track: String(normalized.track || ""),
    status: String(normalized.status || ""),
    updated_at: String(normalized.updatedAt || nowIso()),
    payload: JSON.stringify(normalized),
  };
}

function toDesktopBox(box: CflowBox) {
  return parsePayload<Record<string, unknown>>(box.payload, {
    id: box.id,
    clientId: box.client_id,
    clientCode: normalizeGeneratedClientCode(box.client_code),
    phone: box.phone,
    telegramId: box.telegram_id,
    track: box.track,
    status: box.status,
    updatedAt: box.updated_at,
  });
}

function toStoredEntity(input: Record<string, unknown>, prefix: string, existing?: CflowStoredEntity | null): CflowStoredEntity {
  const previous = existing ? parsePayload<Record<string, unknown>>(existing.payload, {}) : {};
  const payload = {
    ...previous,
    ...input,
    id: String(input.id || previous.id || `${prefix}-${Date.now()}`).trim(),
    updatedAt: String(input.updatedAt || previous.updatedAt || input.time || nowIso()),
  };
  return {
    id: String(payload.id),
    updated_at: String(payload.updatedAt),
    payload: JSON.stringify(payload),
  };
}

function toDesktopEntity(entity: CflowStoredEntity) {
  return parsePayload<Record<string, unknown>>(entity.payload, { id: entity.id, updatedAt: entity.updated_at });
}

function normalizeTelegramUsername(value: unknown) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

function normalizeStaffRole(value: unknown) {
  const role = String(value || "").trim();
  if (role === "Руководитель" || role === "Администратор") return "Руководитель";
  if (role === "Менеджер") return "Менеджер";
  if (role === "Кладовщик") return "Кладовщик";
  if (role === "Оператор") return "Оператор";
  return role || "Менеджер";
}

function staffPermissions(role: string, permissions: unknown) {
  if (Array.isArray(permissions) && permissions.length) return permissions.map(String);
  if (role === "Руководитель") return ["all"];
  if (role === "Менеджер") return ["receive_box", "issue_box", "search", "clients", "warehouse"];
  if (role === "Кладовщик") return ["receive_box", "move_box", "issue_box", "warehouse"];
  return ["receive_box", "issue_box", "search"];
}

function fromDesktopStaff(input: Record<string, unknown>): CflowStaff {
  const now = nowIso();
  const role = normalizeStaffRole(input.role);
  const permissions = staffPermissions(role, input.permissions);
  const payload = {
    ...input,
    id: String(input.id || `STAFF-${Date.now()}`).trim(),
    name: String(input.name || input.username || "Менеджер").trim(),
    username: String(input.username || "").trim(),
    telegramUsername: normalizeTelegramUsername(input.telegramUsername || input.telegram || input.telegram_username),
    role,
    permissions,
    status: String(input.status || "active").trim() || "active",
    updatedAt: String(input.updatedAt || now),
  };
  return {
    id: String(payload.id),
    name: String(payload.name),
    username: String(payload.username),
    telegram_username: String(payload.telegramUsername),
    role,
    permissions: JSON.stringify(permissions),
    status: String(payload.status),
    updated_at: String(payload.updatedAt),
    payload: JSON.stringify(payload),
  };
}

function toDesktopStaff(staff: CflowStaff) {
  return parsePayload<Record<string, unknown>>(staff.payload, {
    id: staff.id,
    name: staff.name,
    username: staff.username,
    telegramUsername: staff.telegram_username,
    role: staff.role,
    permissions: parsePayload<string[]>(staff.permissions, []),
    status: staff.status,
    updatedAt: staff.updated_at,
  });
}

async function upsertStaff(env: Env, input: Record<string, unknown>) {
  await ensureTables(env.DB);
  const staff = fromDesktopStaff(input);
  memoryStaff.set(staff.id, staff);
  if (!env.DB) return staff;
  await env.DB.prepare(`
    INSERT INTO staff (id, name, username, telegram_username, role, permissions, status, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      username = excluded.username,
      telegram_username = excluded.telegram_username,
      role = excluded.role,
      permissions = excluded.permissions,
      status = excluded.status,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `).bind(staff.id, staff.name, staff.username, staff.telegram_username, staff.role, staff.permissions, staff.status, staff.updated_at, staff.payload).run();
  return staff;
}

async function listStaff(env: Env) {
  await ensureTables(env.DB);
  if (!env.DB) return [...memoryStaff.values()].sort((a, b) => a.name.localeCompare(b.name));
  const result = await env.DB.prepare("SELECT * FROM staff ORDER BY name ASC").all<CflowStaff>();
  return result.results || [];
}

async function findActiveStaffByTelegram(env: Env, username: string) {
  const telegramUsername = normalizeTelegramUsername(username);
  if (!telegramUsername) return null;
  await ensureTables(env.DB);
  const staff = env.DB
    ? await env.DB.prepare("SELECT * FROM staff WHERE telegram_username = ? AND status = 'active' LIMIT 1").bind(telegramUsername).first<CflowStaff>()
    : [...memoryStaff.values()].find((item) => item.telegram_username === telegramUsername && item.status === "active") || null;
  return staff;
}

async function syncStaffList(env: Env, staffInput: Record<string, unknown>[]) {
  const saved = await Promise.all(staffInput.map((item) => upsertStaff(env, item)));
  const activeIds = new Set(saved.map((item) => item.id));
  const existing = await listStaff(env);
  await Promise.all(existing
    .filter((item) => !activeIds.has(item.id))
    .map((item) => upsertStaff(env, { ...toDesktopStaff(item), status: "disabled", updatedAt: nowIso() })));
  return listStaff(env);
}

function canUseManageMiniApp(staff: CflowStaff | null) {
  if (!staff) return false;
  const permissions = parsePayload<string[]>(staff.permissions, []);
  return permissions.includes("all") || permissions.includes("issue_box") || permissions.includes("warehouse") || permissions.includes("clients");
}

function parseTelegramUser(params: URLSearchParams) {
  const raw = params.get("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { id: number; username?: string; first_name?: string; last_name?: string };
  } catch {
    return null;
  }
}

async function verifyTelegramInitData(initData: string, botToken?: string) {
  if (!initData) return { ok: false as const, error: "Откройте кабинет через Telegram" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  params.delete("hash");
  if (!hash) return { ok: false as const, error: "Нет подписи Telegram" };
  if (!botToken) return { ok: false as const, error: "Бот не настроен" };
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const actual = hex(await hmac(secret, checkString));
  if (actual !== hash) return { ok: false as const, error: "Неверная подпись Telegram" };
  return { ok: true as const, user: parseTelegramUser(params) };
}

async function verifyManageInitData(initData: string, env: Env) {
  const verified = await verifyTelegramInitData(initData, env.CFLOW_MANAGE_TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return verified;
  if (!verified.user?.id) return { ok: false as const, error: "Telegram пользователь не найден" };
  const allowed = String(env.CFLOW_MANAGE_ALLOWED_TELEGRAM_USERNAMES || "esaraev85")
    .split(",")
    .map((item) => item.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  const username = normalizeTelegramUsername(verified.user.username || "");
  if (!username) {
    return { ok: false as const, error: "Нет доступа к управлению Zabota GO" };
  }
  if (allowed.includes(username)) return verified;
  const staff = await findActiveStaffByTelegram(env, username);
  if (!canUseManageMiniApp(staff)) {
    return { ok: false as const, error: "Нет доступа к управлению Zabota GO" };
  }
  return { ...verified, staff: staff ? toDesktopStaff(staff) : null };
}

async function ensureTables(db?: D1Database) {
  if (!db) return;
  if (ensureTablesPromise) return ensureTablesPromise;
  ensureTablesPromise = (async () => {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      telegram_username TEXT DEFAULT '',
      telegram_id TEXT DEFAULT '',
      comments TEXT DEFAULT '',
      client_code TEXT DEFAULT '',
      china_address TEXT DEFAULT '',
      client_rate REAL DEFAULT 0,
      china_rate REAL DEFAULT 0,
      registration_source TEXT NOT NULL DEFAULT 'manual',
      registration_status TEXT NOT NULL DEFAULT 'approved',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS clients_phone_idx ON clients(phone)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS clients_telegram_id_idx ON clients(telegram_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS clients_client_code_idx ON clients(client_code)").run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT DEFAULT '',
      telegram_username TEXT DEFAULT '',
      role TEXT DEFAULT '',
      permissions TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS staff_telegram_username_idx ON staff(telegram_username)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS staff_status_idx ON staff(status)").run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS boxes (
      id TEXT PRIMARY KEY,
      client_id TEXT DEFAULT '',
      client_code TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      telegram_id TEXT DEFAULT '',
      track TEXT DEFAULT '',
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS boxes_client_id_idx ON boxes(client_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS boxes_client_code_idx ON boxes(client_code)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS boxes_phone_idx ON boxes(phone)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS boxes_telegram_id_idx ON boxes(telegram_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS boxes_track_idx ON boxes(track)").run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      time TEXT DEFAULT '',
      box_id TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS client_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'available',
      client_id TEXT DEFAULT '',
      client_name TEXT DEFAULT '',
      assigned_at TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS client_codes_status_idx ON client_codes(status)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS client_codes_client_id_idx ON client_codes(client_id)").run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS deleted_boxes (
      id TEXT PRIMARY KEY,
      reason TEXT DEFAULT '',
      deleted_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS deleted_clients (
      id TEXT PRIMARY KEY,
      reason TEXT DEFAULT '',
      deleted_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      reason TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      checksum TEXT DEFAULT '',
      payload TEXT NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS backups_created_at_idx ON backups(created_at)").run();
  })().catch((error) => {
    ensureTablesPromise = null;
    throw error;
  });
  return ensureTablesPromise;
}

function publicClient(client: CflowClient | null, boxes: unknown[] = []) {
  return {
    registered: Boolean(client),
    approved: client?.registration_status === "approved",
    client: client ? {
      id: client.id,
      name: client.name,
      phone: client.phone,
      status: client.registration_status,
      code: normalizeGeneratedClientCode(client.client_code),
      chinaAddress: client.china_address,
    } : null,
    boxes,
  };
}

function toDesktopClient(client: CflowClient) {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    telegram: client.telegram_username,
    telegramId: client.telegram_id,
    comments: client.comments,
    clientCode: normalizeGeneratedClientCode(client.client_code),
    chinaAddress: client.china_address,
    clientRate: client.client_rate,
    chinaRate: client.china_rate,
    registrationSource: client.registration_source,
    registrationStatus: client.registration_status,
    createdAt: client.created_at,
    updatedAt: client.updated_at,
  };
}

function fromInput(input: Record<string, unknown>, existing?: CflowClient | null): CflowClient {
  const now = nowIso();
  const id = normalizeId(String(input.id || existing?.id || makeClientId()));
  const registrationSource = String(input.registrationSource || existing?.registration_source || "manual") === "telegram" ? "telegram" : "manual";
  const registrationStatus = String(input.registrationStatus || input.status || existing?.registration_status || (registrationSource === "telegram" ? "pending" : "approved")) as RegistrationStatus;
  const fallbackName = cleanName(existing?.name) || cleanName(input.telegram || input.telegramUsername) || cleanName(input.phone) || "Клиент";
  return {
    id,
    name: cleanName(input.name || input.fullName, fallbackName),
    phone: String(input.phone || existing?.phone || "").trim(),
    telegram_username: String(input.telegram || input.telegramUsername || existing?.telegram_username || "").trim(),
    telegram_id: String(input.telegramId || existing?.telegram_id || "").trim(),
    comments: String(input.comments || input.comment || existing?.comments || "").trim(),
    client_code: normalizeGeneratedClientCode(input.clientCode || input.code || existing?.client_code || ""),
    china_address: String(input.chinaAddress || existing?.china_address || "").trim(),
    client_rate: toNumber(input.clientRate || existing?.client_rate),
    china_rate: toNumber(input.chinaRate || existing?.china_rate),
    registration_source: registrationSource,
    registration_status: ["pending", "approved", "rejected"].includes(registrationStatus) ? registrationStatus : "pending",
    created_at: String(input.createdAt || existing?.created_at || now),
    updated_at: now,
  };
}

async function findClient(env: Env, query: { id?: string; telegramId?: string; phone?: string; clientCode?: string; name?: string }) {
  await ensureTables(env.DB);
  const telegramId = normalizeId(query.telegramId);
  const phone = normalizeId(query.phone);
  const clientCode = normalizeGeneratedClientCode(normalizeId(query.clientCode));
  const id = normalizeId(query.id);
  const name = normalizeId(query.name).toLowerCase();

  if (!env.DB) {
    return [...memoryClients.values()].find((client) =>
      (id && client.id === id) ||
      (telegramId && client.telegram_id === telegramId) ||
      (phone && client.phone === phone) ||
      (clientCode && client.client_code.toLowerCase() === clientCode.toLowerCase()) ||
      (name && client.name.toLowerCase() === name),
    ) || null;
  }

  if (id) return await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first<CflowClient>();
  if (telegramId) return await env.DB.prepare("SELECT * FROM clients WHERE telegram_id = ?").bind(telegramId).first<CflowClient>();
  if (phone) return await env.DB.prepare("SELECT * FROM clients WHERE phone = ?").bind(phone).first<CflowClient>();
  if (clientCode) return await env.DB.prepare("SELECT * FROM clients WHERE lower(client_code) = lower(?)").bind(clientCode).first<CflowClient>();
  if (name) return await env.DB.prepare("SELECT * FROM clients WHERE lower(name) = lower(?)").bind(name).first<CflowClient>();
  return null;
}

async function findDeletedClient(env: Env, id: string) {
  await ensureTables(env.DB);
  const cleanId = normalizeId(id);
  if (!cleanId) return null;
  if (!env.DB) return memoryDeletedClients.get(cleanId) || null;
  return await env.DB.prepare("SELECT * FROM deleted_clients WHERE id = ?").bind(cleanId).first<CflowTombstone>();
}

async function upsertDeletedClient(env: Env, input: Record<string, unknown>) {
  await ensureTables(env.DB);
  const id = normalizeId(String(input.id || input.clientId || ""));
  if (!id) return null;
  const deletedAt = String(input.deletedAt || input.deleted_at || nowIso());
  const tombstone = { id, reason: String(input.reason || "").trim(), deleted_at: deletedAt };
  memoryDeletedClients.set(id, tombstone);
  memoryClients.delete(id);
  for (const [key, code] of memoryClientCodes.entries()) {
    if (code.client_id === id) {
      memoryClientCodes.set(key, {
        ...code,
        status: "available",
        client_id: "",
        client_name: "",
        assigned_at: "",
        updated_at: deletedAt,
      });
    }
  }
  if (!env.DB) return tombstone;
  await env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(id).run();
  await env.DB.prepare(`
    UPDATE client_codes
    SET status = 'available', client_id = '', client_name = '', assigned_at = '', updated_at = ?
    WHERE client_id = ?
  `).bind(deletedAt, id).run();
  await env.DB.prepare(`
    INSERT INTO deleted_clients (id, reason, deleted_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET reason = excluded.reason, deleted_at = excluded.deleted_at
  `).bind(tombstone.id, tombstone.reason, tombstone.deleted_at).run();
  return tombstone;
}

async function upsertClient(env: Env, input: Record<string, unknown>) {
  const deleted = await findDeletedClient(env, String(input.id || ""));
  if (deleted) return null;
  const isTelegramRegistration = String(input.registrationSource || "") === "telegram" && !input.id;
  const existing = await findClient(env, {
    id: String(input.id || ""),
    telegramId: String(input.telegramId || ""),
    phone: String(input.phone || ""),
    clientCode: normalizeGeneratedClientCode(input.clientCode || input.code || ""),
    name: isTelegramRegistration ? "" : String(input.name || input.fullName || ""),
  });
  const client = fromInput(input, existing);
  if (!client.name) throw new Error("Укажите имя клиента");

  memoryClients.set(client.id, client);
  if (!env.DB) return client;

  await ensureTables(env.DB);
  await env.DB.prepare(`
    INSERT INTO clients (
      id, name, phone, telegram_username, telegram_id, comments, client_code, china_address,
      client_rate, china_rate, registration_source, registration_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      telegram_username = excluded.telegram_username,
      telegram_id = excluded.telegram_id,
      comments = excluded.comments,
      client_code = CASE WHEN excluded.client_code != '' THEN excluded.client_code ELSE clients.client_code END,
      china_address = CASE WHEN excluded.china_address != '' THEN excluded.china_address ELSE clients.china_address END,
      client_rate = CASE WHEN excluded.client_rate > 0 THEN excluded.client_rate ELSE clients.client_rate END,
      china_rate = CASE WHEN excluded.china_rate > 0 THEN excluded.china_rate ELSE clients.china_rate END,
      registration_source = excluded.registration_source,
      registration_status = excluded.registration_status,
      updated_at = excluded.updated_at
  `).bind(
    client.id,
    client.name,
    client.phone,
    client.telegram_username,
    client.telegram_id,
    client.comments,
    client.client_code,
    client.china_address,
    client.client_rate,
    client.china_rate,
    client.registration_source,
    client.registration_status,
    client.created_at,
    client.updated_at,
  ).run();
  return client;
}

async function listClients(env: Env) {
  await ensureTables(env.DB);
  if (!env.DB) return [...memoryClients.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const result = await env.DB.prepare("SELECT * FROM clients ORDER BY updated_at DESC").all<CflowClient>();
  return result.results || [];
}

async function deleteClient(env: Env, id: string) {
  await ensureTables(env.DB);
  const cleanId = normalizeId(id);
  if (!cleanId) throw new Error("Клиент не найден");
  const client = await findClient(env, { id: cleanId });
  if (!client) throw new Error("Клиент не найден");

  const boxes = await getBoxes(env, client);
  if (boxes.length) throw new Error("У клиента есть коробки. Сначала разберите связанные грузы в desktop-приложении.");

  await upsertDeletedClient(env, { id: cleanId, deletedAt: nowIso() });
  return client;
}

async function findBox(env: Env, id: string) {
  await ensureTables(env.DB);
  const cleanId = normalizeId(id);
  if (!cleanId) return null;
  if (!env.DB) return memoryBoxes.get(cleanId) || null;
  return await env.DB.prepare("SELECT * FROM boxes WHERE id = ?").bind(cleanId).first<CflowBox>();
}

async function findDeletedBox(env: Env, id: string) {
  await ensureTables(env.DB);
  const cleanId = normalizeId(id);
  if (!cleanId) return null;
  if (!env.DB) return memoryDeletedBoxes.get(cleanId) || null;
  return await env.DB.prepare("SELECT * FROM deleted_boxes WHERE id = ?").bind(cleanId).first<CflowTombstone>();
}

async function upsertDeletedBox(env: Env, input: Record<string, unknown>) {
  await ensureTables(env.DB);
  const id = normalizeId(String(input.id || input.boxId || ""));
  if (!id) return null;
  const deletedAt = String(input.deletedAt || input.deleted_at || nowIso());
  const tombstone = { id, reason: String(input.reason || "").trim(), deleted_at: deletedAt };
  memoryDeletedBoxes.set(id, tombstone);
  memoryBoxes.delete(id);
  if (!env.DB) return tombstone;
  await env.DB.prepare("DELETE FROM boxes WHERE id = ?").bind(id).run();
  await env.DB.prepare(`
    INSERT INTO deleted_boxes (id, reason, deleted_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET reason = excluded.reason, deleted_at = excluded.deleted_at
  `).bind(tombstone.id, tombstone.reason, tombstone.deleted_at).run();
  return tombstone;
}

async function upsertBox(env: Env, input: Record<string, unknown>) {
  const deleted = await findDeletedBox(env, String(input.id || ""));
  if (deleted) return null;
  const existing = await findBox(env, String(input.id || ""));
  const box = toStoredBox(input, existing);
  if (!box.track && !box.id) throw new Error("Укажите коробку");
  memoryBoxes.set(box.id, box);
  if (!env.DB) return box;
  await ensureTables(env.DB);
  await env.DB.prepare(`
    INSERT INTO boxes (id, client_id, client_code, phone, telegram_id, track, status, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      client_code = excluded.client_code,
      phone = excluded.phone,
      telegram_id = excluded.telegram_id,
      track = excluded.track,
      status = excluded.status,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `).bind(box.id, box.client_id, box.client_code, box.phone, box.telegram_id, box.track, box.status, box.updated_at, box.payload).run();
  return box;
}

async function deleteBox(env: Env, id: string) {
  const cleanId = normalizeId(id);
  if (!cleanId) return;
  await upsertDeletedBox(env, { id: cleanId, deletedAt: nowIso() });
}

async function listBoxes(env: Env) {
  await ensureTables(env.DB);
  if (!env.DB) return [...memoryBoxes.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const result = await env.DB.prepare("SELECT * FROM boxes ORDER BY updated_at DESC").all<CflowBox>();
  return result.results || [];
}

async function listDeletedBoxes(env: Env) {
  await ensureTables(env.DB);
  if (!env.DB) return [...memoryDeletedBoxes.values()].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  const result = await env.DB.prepare("SELECT * FROM deleted_boxes ORDER BY deleted_at DESC").all<CflowTombstone>();
  return result.results || [];
}

async function listDeletedClients(env: Env) {
  await ensureTables(env.DB);
  if (!env.DB) return [...memoryDeletedClients.values()].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  const result = await env.DB.prepare("SELECT * FROM deleted_clients ORDER BY deleted_at DESC").all<CflowTombstone>();
  return result.results || [];
}

type StoredEntityTable = "shipments" | "activity" | "invoices";

function entityMemory(table: StoredEntityTable) {
  if (table === "shipments") return memoryShipments;
  if (table === "activity") return memoryActivity;
  return memoryInvoices;
}

async function upsertEntity(env: Env, table: StoredEntityTable, input: Record<string, unknown>, prefix: string) {
  await ensureTables(env.DB);
  const id = String(input.id || "").trim();
  let existing: CflowStoredEntity | null = null;
  const memory = entityMemory(table);
  if (id) {
    existing = env.DB
      ? await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<CflowStoredEntity>()
      : memory.get(id) || null;
  }
  const entity = toStoredEntity(input, prefix, existing);
  memory.set(entity.id, entity);
  if (!env.DB) return entity;
  if (table === "activity") {
    const payload = parsePayload<Record<string, unknown>>(entity.payload, {});
    await env.DB.prepare(`
      INSERT INTO activity (id, time, box_id, updated_at, payload)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        time = excluded.time,
        box_id = excluded.box_id,
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `).bind(entity.id, String(payload.time || entity.updated_at), String(payload.boxId || ""), entity.updated_at, entity.payload).run();
    return entity;
  }
  await env.DB.prepare(`
    INSERT INTO ${table} (id, updated_at, payload)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload
  `).bind(entity.id, entity.updated_at, entity.payload).run();
  return entity;
}

async function listEntities(env: Env, table: StoredEntityTable) {
  await ensureTables(env.DB);
  const memory = entityMemory(table);
  if (!env.DB) return [...memory.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const result = await env.DB.prepare(`SELECT id, updated_at, payload FROM ${table} ORDER BY updated_at DESC`).all<CflowStoredEntity>();
  return result.results || [];
}

function toDesktopClientCode(item: CflowClientCode) {
  return {
    id: item.id,
    code: item.code,
    status: item.status,
    clientId: item.client_id,
    clientName: item.client_name,
    assignedAt: item.assigned_at,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function fromDesktopClientCode(input: Record<string, unknown>, count = 0): CflowClientCode {
  const now = nowIso();
  const code = normalizeGeneratedClientCode(input.code || input.clientCode || "");
  const clientId = String(input.clientId || "").trim();
  const status = String(input.status || (clientId ? "assigned" : "available")) === "assigned" ? "assigned" : "available";
  return {
    id: String(input.id || `CC-${String(count + 1).padStart(6, "0")}`).trim(),
    code,
    status,
    client_id: clientId,
    client_name: String(input.clientName || "").trim(),
    assigned_at: String(input.assignedAt || ""),
    created_at: String(input.createdAt || now),
    updated_at: String(input.updatedAt || now),
  };
}

async function upsertClientCode(env: Env, input: Record<string, unknown>, count = 0) {
  await ensureTables(env.DB);
  const item = fromDesktopClientCode(input, count);
  if (!item.code) throw new Error("Код клиента пустой");
  memoryClientCodes.set(item.code.toLowerCase(), item);
  if (!env.DB) return item;
  const existingById = await env.DB.prepare("SELECT id FROM client_codes WHERE id = ?").bind(item.id).first<{ id: string }>();
  if (existingById) {
    await env.DB.prepare(`
      UPDATE client_codes
      SET code = ?, status = ?, client_id = ?, client_name = ?, assigned_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(item.code, item.status, item.client_id, item.client_name, item.assigned_at, item.updated_at, item.id).run();
    return item;
  }
  await env.DB.prepare(`
    INSERT INTO client_codes (id, code, status, client_id, client_name, assigned_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      id = excluded.id,
      status = excluded.status,
      client_id = excluded.client_id,
      client_name = excluded.client_name,
      assigned_at = excluded.assigned_at,
      updated_at = excluded.updated_at
  `).bind(item.id, item.code, item.status, item.client_id, item.client_name, item.assigned_at, item.created_at, item.updated_at).run();
  return item;
}

async function listClientCodes(env: Env) {
  await ensureTables(env.DB);
  if (!env.DB) return [...memoryClientCodes.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const result = await env.DB.prepare("SELECT * FROM client_codes ORDER BY created_at DESC").all<CflowClientCode>();
  return result.results || [];
}

async function getSettings(env: Env) {
  await ensureTables(env.DB);
  if (!env.DB) return { chinaAddress: memorySettings.get("chinaAddress") || DEFAULT_CHINA_ADDRESS };
  const result = await env.DB.prepare("SELECT key, value FROM app_settings").all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  (result.results || []).forEach((item) => {
    settings[item.key] = item.value;
  });
  return { chinaAddress: settings.chinaAddress || DEFAULT_CHINA_ADDRESS };
}

async function saveSettings(env: Env, settings: Record<string, unknown>) {
  await ensureTables(env.DB);
  const chinaAddress = String(settings.chinaAddress || "").trim();
  if (!chinaAddress) return;
  memorySettings.set("chinaAddress", chinaAddress);
  if (!env.DB) return;
  await env.DB.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('chinaAddress', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(chinaAddress, nowIso()).run();
}

async function generateAndReserveClientCode(env: Env, client: CflowClient) {
  await ensureTables(env.DB);
  const clients = await listClients(env);
  const codeRows = await listClientCodes(env);
  const used = new Set<string>();
  clients.forEach((item) => {
    if (item.client_code) used.add(normalizeGeneratedClientCode(item.client_code).toLowerCase());
  });
  codeRows.forEach((item) => {
    if (item.status === "assigned" || item.client_id) used.add(normalizeGeneratedClientCode(item.code).toLowerCase());
  });

  const assignedAt = nowIso();
  for (let index = 0; index < CLIENT_CODE_CAPACITY; index += 1) {
    const code = fullClientCodeFromIndex(index);
    if (!code || used.has(code.toLowerCase())) continue;

    const codeItem: CflowClientCode = {
      id: `CC-${CLIENT_CODE_CITY_PREFIX}-${String(index + 1).padStart(6, "0")}`,
      code,
      status: "assigned",
      client_id: client.id,
      client_name: client.name,
      assigned_at: assignedAt,
      created_at: assignedAt,
      updated_at: assignedAt,
    };

    if (!env.DB) {
      memoryClientCodes.set(code.toLowerCase(), codeItem);
      return code;
    }

    const updated = await env.DB.prepare(`
      UPDATE client_codes
      SET status = 'assigned', client_id = ?, client_name = ?, assigned_at = ?, updated_at = ?
      WHERE code = ? AND status = 'available' AND client_id = ''
    `).bind(client.id, client.name, assignedAt, assignedAt, code).run();
    if ((updated.meta?.changes || 0) > 0) return code;

    const inserted = await env.DB.prepare(`
      INSERT OR IGNORE INTO client_codes (id, code, status, client_id, client_name, assigned_at, created_at, updated_at)
      VALUES (?, ?, 'assigned', ?, ?, ?, ?, ?)
    `).bind(codeItem.id, code, client.id, client.name, assignedAt, assignedAt, assignedAt).run();
    if ((inserted.meta?.changes || 0) > 0) return code;

    used.add(code.toLowerCase());
  }

  throw new Error("Лимит кодов AST исчерпан");
}

async function issueCodeToClient(env: Env, query: { id?: string; telegramId?: string }) {
  const existing = await findClient(env, { id: String(query.id || ""), telegramId: String(query.telegramId || "") });
  if (!existing) throw new Error("Клиент не найден");
  const settings = await getSettings(env);
  const chinaAddress = String(settings.chinaAddress || "").trim();
  if (!chinaAddress) throw new Error("Сначала задайте адрес склада");

  let nextCode = existing.client_code;
  if (!nextCode) {
    nextCode = await generateAndReserveClientCode(env, existing);
  }

  const updated = await upsertClient(env, {
    ...toDesktopClient(existing),
    clientCode: nextCode,
    chinaAddress: existing.china_address || chinaAddress,
    registrationStatus: "approved",
  });
  if (!updated) throw new Error("Клиент удален");
  return updated;
}

function boxStage(status: string) {
  const value = String(status || "").toLowerCase();
  if (value.includes("выдан")) return "astana";
  if (value.includes("астан") || value.includes("ждет выдачи") || value.includes("прибыл")) return "astana";
  if (value.includes("казахстан") || value.includes("тамож")) return "kazakhstan";
  if (value.includes("пути") || value.includes("отправ")) return "in_transit";
  return "china_warehouse";
}

function publicBox(box: CflowBox) {
  const payload = toDesktopBox(box);
  const amount = payload.chargeAmount || payload.amount || "";
  const clientRate = payload.clientRate || "";
  return {
    id: String(payload.id || box.id),
    track: String(payload.track || box.track || ""),
    weight: String(payload.weight || ""),
    invoiceId: String(payload.invoiceId || ""),
    invoiceNumber: String(payload.batch || ""),
    amount: amount ? `${amount} T` : "",
    clientRate: clientRate ? `${clientRate} T/кг` : "",
    status: String(payload.status || box.status || ""),
    stage: boxStage(String(payload.status || box.status || "")),
    updated_at: String(payload.updatedAt || box.updated_at),
  };
}

function isBoxDelivered(box: Record<string, unknown>) {
  return String(box.status || "").trim().toLowerCase().includes("выдан");
}

async function clientClaim(env: Env, client: CflowClient, knownBoxes?: Record<string, unknown>[]) {
  const boxes = knownBoxes || await getBoxes(env, client);
  const activeBoxes = boxes.filter((box) => !isBoxDelivered(box as Record<string, unknown>));
  const boxIds = activeBoxes.map((box) => String((box as { id?: string }).id || "")).filter(Boolean).sort();
  if (!boxIds.length) return null;
  const token = await createClaimToken(env, {
    type: "claim",
    version: 1,
    clientId: client.id,
    clientCode: normalizeGeneratedClientCode(client.client_code),
    boxIds,
  });
  return {
    token,
    boxIds,
    boxesCount: boxIds.length,
    title: `${boxIds.length} посылок к получению`,
  };
}

async function getBoxes(env: Env, client: CflowClient) {
  await ensureTables(env.DB);
  const candidates = [client.id, client.client_code, client.phone, client.telegram_id].filter(Boolean);
  if (!candidates.length) return [];
  if (!env.DB) {
    return [...memoryBoxes.values()]
      .filter((box) => candidates.includes(box.client_id) || candidates.includes(box.client_code) || candidates.includes(box.phone) || candidates.includes(box.telegram_id))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(publicBox);
  }
  const result = await env.DB.prepare(`
    SELECT * FROM boxes
    WHERE client_id = ? OR client_code = ? OR phone = ? OR telegram_id = ?
    ORDER BY updated_at DESC
  `).bind(client.id, client.client_code, client.phone, client.telegram_id).all<CflowBox>();
  return (result.results || []).map(publicBox);
}

function deriveFinances(boxes: Record<string, unknown>[]) {
  return boxes.reduce((finances, box) => {
    const charge = toNumber(box.chargeAmount || box.amount);
    const cost = toNumber(box.costAmount);
    const profit = toNumber(box.profitAmount) || charge - cost;
    finances.chargedToday += charge;
    finances.costToday += cost;
    finances.expensesToday += cost;
    finances.profitToday += profit;
    if (String(box.payment || "").toLowerCase().includes("оплач") && !String(box.payment || "").toLowerCase().includes("не ")) {
      finances.incomeToday += charge;
    } else {
      finances.expectedToday += charge;
      finances.debt += charge;
    }
    return finances;
  }, { incomeToday: 0, expectedToday: 0, expensesToday: 0, debt: 0, costToday: 0, chargedToday: 0, profitToday: 0 });
}

function deriveWarehouse(boxes: Record<string, unknown>[]) {
  const groups = new Map<string, { zone: string; boxes: number; note: string }>();
  boxes.filter((box) => String(box.status || "") !== "Выдано").forEach((box) => {
    const place = String(box.place || "").trim();
    const zone = place.split(/[\/\s-]+/).filter(Boolean)[0] || "Без места";
    const current = groups.get(zone) || { zone, boxes: 0, note: place || "Место не указано" };
    current.boxes += 1;
    groups.set(zone, current);
  });
  return [...groups.values()].map((item) => ({ ...item, fill: Math.min(100, Math.max(8, item.boxes * 8)) }));
}

async function cloudSnapshot(env: Env) {
  const clients = await listClients(env);
  const boxes = (await listBoxes(env)).map(toDesktopBox);
  const shipments = (await listEntities(env, "shipments")).map(toDesktopEntity);
  const invoices = (await listEntities(env, "invoices")).map(toDesktopEntity);
  const activity = (await listEntities(env, "activity")).map(toDesktopEntity);
  const clientCodes = (await listClientCodes(env)).map(toDesktopClientCode);
  const staff = (await listStaff(env)).map(toDesktopStaff);
  const deletedBoxes = (await listDeletedBoxes(env)).map((item) => ({
    id: item.id,
    reason: item.reason,
    deletedAt: item.deleted_at,
  }));
  const deletedClients = (await listDeletedClients(env)).map((item) => ({
    id: item.id,
    reason: item.reason,
    deletedAt: item.deleted_at,
  }));
  const settings = await getSettings(env);
  return {
    clients: clients.map(toDesktopClient),
    boxes,
    shipments,
    invoices,
    warehouse: deriveWarehouse(boxes),
    finances: deriveFinances(boxes),
    activity,
    clientCodes,
    staff,
    deletedBoxes,
    deletedClients,
    settings,
  };
}

async function createCloudBackup(env: Env, input: Record<string, unknown>) {
  await ensureTables(env.DB);
  const backup = (input.backup && typeof input.backup === "object" ? input.backup : input) as Record<string, unknown>;
  const metadata = (backup.metadata && typeof backup.metadata === "object" ? backup.metadata : {}) as Record<string, unknown>;
  const createdAt = String(metadata.createdAt || input.createdAt || nowIso());
  const reason = String(input.reason || metadata.reason || "manual").trim();
  const id = String(input.id || `BKP-${createdAt.replace(/[:.]/g, "-")}-${Math.random().toString(16).slice(2, 6)}`).trim();
  const payload = JSON.stringify(backup);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const checksum = String(metadata.checksum || hex(digest));
  const row = { id, reason, created_at: createdAt, checksum, payload };
  memoryBackups.set(id, row);
  if (!env.DB) return row;
  await env.DB.prepare(`
    INSERT INTO backups (id, reason, created_at, checksum, payload)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      reason = excluded.reason,
      created_at = excluded.created_at,
      checksum = excluded.checksum,
      payload = excluded.payload
  `).bind(row.id, row.reason, row.created_at, row.checksum, row.payload).run();
  await env.DB.prepare(`
    DELETE FROM backups
    WHERE id NOT IN (
      SELECT id FROM backups ORDER BY created_at DESC LIMIT 120
    )
  `).run();
  return row;
}

function requireAdmin(request: Request, env: Env) {
  const auth = request.headers.get("authorization") || "";
  return Boolean(env.CFLOW_ADMIN_TOKEN && auth === `Bearer ${env.CFLOW_ADMIN_TOKEN}`);
}

function clientWebAppUrl(request: Request, env: Env) {
  return env.CFLOW_TELEGRAM_WEBAPP_URL || `${new URL(request.url).origin}/`;
}

function telegramReplyKeyboard(webAppUrl: string) {
  return {
    inline_keyboard: [[
      { text: "Открыть кабинет Zabota GO", web_app: { url: webAppUrl } },
    ]],
  };
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function telegramApi(env: Env, method: string, payload: Record<string, unknown>) {
  if (!env.CFLOW_TELEGRAM_BOT_TOKEN) return { ok: false, skipped: true, error: "Бот не настроен" };
  const response = await fetch(`https://api.telegram.org/bot${env.CFLOW_TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return await response.json() as Record<string, unknown>;
}

async function telegramMultipartApi(env: Env, method: string, payload: Record<string, string | Blob>) {
  if (!env.CFLOW_TELEGRAM_BOT_TOKEN) return { ok: false, skipped: true, error: "Бот не настроен" };
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => form.append(key, value));
  const response = await fetch(`https://api.telegram.org/bot${env.CFLOW_TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    body: form,
  });
  return await response.json() as Record<string, unknown>;
}

async function sendClientLaunchMessage(env: Env, chatId: string | number, webAppUrl: string) {
  return await telegramApi(env, "sendMessage", {
    chat_id: chatId,
    text: [
      "Добро пожаловать в Zabota GO.",
      "",
      "Нажмите кнопку ниже, чтобы открыть личный кабинет, пройти регистрацию, получить код клиента и смотреть статусы посылок.",
    ].join("\n"),
    reply_markup: telegramReplyKeyboard(webAppUrl),
  });
}

function parseDataUrl(value: string) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].replace("image/jpg", "image/jpeg");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mime, blob: new Blob([bytes], { type: mime }) };
}

function broadcastText(title: string, message: string) {
  return [
    title ? `<b>${escapeHtml(title)}</b>` : "",
    escapeHtml(message),
  ].filter(Boolean).join("\n\n");
}

function broadcastRecipients(clients: CflowClient[], audience: BroadcastAudience) {
  const seen = new Set<string>();
  return clients.filter((client) => {
    if (!client.telegram_id || seen.has(client.telegram_id)) return false;
    if (audience === "approved" && client.registration_status !== "approved") return false;
    if (audience === "pending" && client.registration_status === "approved") return false;
    seen.add(client.telegram_id);
    return true;
  });
}

async function sendBroadcastMessage(env: Env, request: Request, client: CflowClient, payload: { title: string; message: string; imageData: string }) {
  const text = broadcastText(payload.title, payload.message);
  const image = parseDataUrl(payload.imageData);
  const replyMarkup = JSON.stringify(telegramReplyKeyboard(clientWebAppUrl(request, env)));

  if (image) {
    const caption = text.length <= 1000 ? text : "";
    const photoResult = await telegramMultipartApi(env, "sendPhoto", {
      chat_id: client.telegram_id,
      photo: image.blob,
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    if (text.length > 1000) {
      await telegramApi(env, "sendMessage", {
        chat_id: client.telegram_id,
        parse_mode: "HTML",
        text,
        reply_markup: telegramReplyKeyboard(clientWebAppUrl(request, env)),
      });
    }
    return photoResult;
  }

  return await telegramApi(env, "sendMessage", {
    chat_id: client.telegram_id,
    parse_mode: "HTML",
    text,
    reply_markup: telegramReplyKeyboard(clientWebAppUrl(request, env)),
  });
}

async function notifyClientApproved(env: Env, request: Request, client: CflowClient) {
  if (!client.telegram_id || !client.client_code || !client.china_address) return { ok: false, skipped: true };
  return await telegramApi(env, "sendMessage", {
    chat_id: client.telegram_id,
    parse_mode: "HTML",
    text: [
      "✅ Ваша регистрация подтверждена.",
      "",
      "Код клиента:",
      `<code>${escapeHtml(client.client_code)}</code>`,
      "",
      "Адрес склада в Китае:",
      `<code>${escapeHtml(client.china_address)}</code>`,
      "",
      "Откройте кабинет, чтобы скопировать код и адрес отдельно и отслеживать статусы посылок.",
    ].join("\n"),
    reply_markup: telegramReplyKeyboard(clientWebAppUrl(request, env)),
  });
}

function shouldNotifyApproval(before: CflowClient | null, after: CflowClient) {
  if (!after.telegram_id || !after.client_code || !after.china_address || after.registration_status !== "approved") return false;
  if (!before) return true;
  return before.registration_status !== "approved" || before.client_code !== after.client_code || before.china_address !== after.china_address;
}

async function findInvoice(env: Env, id: string) {
  await ensureTables(env.DB);
  const cleanId = normalizeId(id);
  if (!cleanId) return null;
  if (!env.DB) return memoryInvoices.get(cleanId) || null;
  return await env.DB.prepare("SELECT id, updated_at, payload FROM invoices WHERE id = ?").bind(cleanId).first<CflowStoredEntity>();
}

function invoicePayload(entity: CflowStoredEntity | null) {
  if (!entity) return null;
  return toDesktopEntity(entity) as Record<string, unknown>;
}

function invoiceItems(invoice: Record<string, unknown>) {
  return Array.isArray(invoice.items) ? invoice.items as Record<string, unknown>[] : [];
}

async function saveInvoicePayload(env: Env, invoice: Record<string, unknown>) {
  return await upsertEntity(env, "invoices", { ...invoice, updatedAt: nowIso() }, "INV");
}

async function resolveInvoiceItem(env: Env, item: Record<string, unknown>) {
  const clientCode = normalizeGeneratedClientCode(item.clientCode || item.code || "");
  const client = await findClient(env, { clientCode });
  const weight = String(item.weight || "");
  const clientRate = toNumber(item.clientRate || item.client_rate);
  const chinaRate = toNumber(item.chinaRate || item.china_rate);
  const manualChargeAmount = toNumber(item.chargeAmount || item.amount);
  const billableWeight = toNumber(weight);
  const costAmount = Math.round(billableWeight * chinaRate);
  const chargeAmount = Math.round(manualChargeAmount || (billableWeight * clientRate));
  const profitAmount = chargeAmount - costAmount;
  return {
    ...item,
    clientCode,
    clientId: client?.id || String(item.clientId || ""),
    clientName: client?.name || String(item.clientName || ""),
    phone: client?.phone || String(item.phone || ""),
    telegramId: client?.telegram_id || String(item.telegramId || ""),
    title: String(item.title || item.name || ""),
    quantity: String(item.quantity || item.qty || "1"),
    packageCount: String(positiveInt(item.packageCount || item.packages || item.package_count || "1")),
    clientRate,
    chinaRate,
    costAmount,
    chargeAmount,
    profitAmount,
    boxIds: Array.isArray(item.boxIds) ? item.boxIds.map(String).filter(Boolean) : [],
    matchStatus: client ? "matched" : "not_found",
  };
}

async function createBoxFromInvoiceItem(env: Env, invoice: Record<string, unknown>, item: Record<string, unknown>, packageIndex = 1, packageTotal = 1) {
  const existingBoxes = await listBoxes(env);
  const track = packageTrack(item, invoice, packageIndex, packageTotal);
  const sourceBoxIds = Array.isArray(item.boxIds) ? item.boxIds.map(String).filter(Boolean) : [];
  const existingId = sourceBoxIds[packageIndex - 1] || (packageTotal === 1 ? String(item.boxId || "") : "");
  const existingById = existingId ? existingBoxes.find((box) => box.id === existingId) : undefined;
  const existingByInvoicePart = existingBoxes.find((box) => {
    const payload = toDesktopBox(box) as Record<string, unknown>;
    return String(payload.invoiceId || "") === String(invoice.id || "") &&
      String(payload.invoiceItemId || "") === String(item.id || "") &&
      Number(payload.packageIndex || 1) === packageIndex;
  });
  const existingByTrack = track ? existingBoxes.find((box) => box.track.toLowerCase() === track.toLowerCase()) : undefined;
  if (existingById || existingByInvoicePart || existingByTrack) return existingById || existingByInvoicePart || existingByTrack;

  const client = item.clientId ? await findClient(env, { id: String(item.clientId) }) : await findClient(env, { clientCode: String(item.clientCode || "") });
  const now = nowIso();
  const itemComment = [
    String(item.title || "").trim(),
    String(item.quantity || "").trim() ? `Количество: ${String(item.quantity || "").trim()}` : "",
    packageTotal > 1 ? `Место: ${packageIndex}/${packageTotal}` : "",
    String(item.description || "").trim(),
    String(invoice.comment || "").trim(),
  ].filter(Boolean).join(" · ");
  return await upsertBox(env, {
    id: makeBoxId(),
    track: track || `INV-${String(invoice.number || invoice.id || "").trim()}-${String(item.id || Date.now())}`,
    code: String(item.marking || item.code || item.title || item.description || "").trim(),
    clientCode: item.clientCode || client?.client_code || "",
    clientId: client?.id || item.clientId || "",
    client: client?.name || item.clientName || "Клиент не найден",
    phone: client?.phone || item.phone || "",
    telegramId: client?.telegram_id || item.telegramId || "",
    status: "На складе в Китае",
    place: "Склад Китай",
    weight: String(item.weight || ""),
    dimensions: String(item.dimensions || ""),
    route: "Китай -> Казахстан",
    payment: "Не оплачено",
    amount: item.chargeAmount || 0,
    chinaRate: item.chinaRate || 0,
    clientRate: item.clientRate || 0,
    costAmount: item.costAmount || 0,
    chargeAmount: item.chargeAmount || 0,
    profitAmount: item.profitAmount || 0,
    chargedAt: "",
    batch: String(invoice.number || invoice.title || invoice.id || ""),
    invoiceId: String(invoice.id || ""),
    invoiceItemId: String(item.id || ""),
    packageIndex,
    packageTotal,
    comment: itemComment,
    owner: "Накладная",
    createdAt: now,
    updatedAt: now,
  });
}

async function confirmInvoice(env: Env, invoiceId: string) {
  const entity = await findInvoice(env, invoiceId);
  const invoice = invoicePayload(entity);
  if (!invoice) throw new Error("Накладная не найдена");
  const resolvedItems = [];
  for (const sourceItem of invoiceItems(invoice)) {
    const item = await resolveInvoiceItem(env, sourceItem);
    const packageTotal = positiveInt(item.packageCount || "1");
    const boxIds: string[] = [];
    for (let packageIndex = 1; packageIndex <= packageTotal; packageIndex += 1) {
      const box = await createBoxFromInvoiceItem(env, invoice, item, packageIndex, packageTotal);
      if (box?.id) boxIds.push(box.id);
    }
    resolvedItems.push({
      ...item,
      boxId: boxIds[0] || item.boxId || "",
      boxIds,
      packageCount: String(packageTotal),
      status: item.matchStatus === "matched" ? "На складе в Китае" : "Клиент не найден",
      confirmedAt: item.confirmedAt || nowIso(),
    });
  }
  const nextInvoice = {
    ...invoice,
    status: "confirmed",
    confirmedAt: invoice.confirmedAt || nowIso(),
    updatedAt: nowIso(),
    items: resolvedItems,
  };
  await saveInvoicePayload(env, nextInvoice);
  await upsertEntity(env, "activity", {
    id: `ACT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    time: nowIso(),
    title: "Накладная",
    text: `Накладная ${String(invoice.number || invoice.id || "")} подтверждена, строк: ${resolvedItems.length}`,
    user: "Cloud",
    updatedAt: nowIso(),
  }, "ACT");
  return nextInvoice;
}

async function arriveInvoice(env: Env, invoiceId: string, user = "Менеджер") {
  const entity = await findInvoice(env, invoiceId);
  const invoice = invoicePayload(entity);
  if (!invoice) throw new Error("Накладная не найдена");
  const now = nowIso();
  const nextItems = [];
  for (const item of invoiceItems(invoice)) {
    const itemBoxIds = Array.isArray(item.boxIds) && item.boxIds.length ? item.boxIds.map(String).filter(Boolean) : String(item.boxId || "") ? [String(item.boxId)] : [];
    for (const boxId of itemBoxIds) {
      const box = await findBox(env, boxId);
      if (box) {
        const payload = toDesktopBox(box);
        await upsertBox(env, {
          ...payload,
          status: "В Астане на складе",
          place: "Склад Астана",
          updatedAt: now,
          owner: user,
        });
      }
    }
    nextItems.push({ ...item, status: "В Астане на складе", arrivedAt: item.arrivedAt || now });
  }
  const nextInvoice = {
    ...invoice,
    status: "arrived",
    arrivedAt: invoice.arrivedAt || now,
    updatedAt: now,
    items: nextItems,
  };
  await saveInvoicePayload(env, nextInvoice);
  await upsertEntity(env, "activity", {
    id: `ACT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    time: now,
    title: "Накладная поступила",
    text: `Накладная ${String(invoice.number || invoice.id || "")} поступила на склад Астаны`,
    user,
    updatedAt: now,
  }, "ACT");
  return nextInvoice;
}

function invoiceStageInfo(stage: string) {
  const stages: Record<string, { title: string; status: string; field: string }> = {
    china_warehouse: { title: "📦 Ваш товар зарегистрирован на складе в Китае.", status: "На складе в Китае", field: "chinaNotifiedAt" },
    china_departed: { title: "✈️ Ваш товар покинул склад в Китае.", status: "Покинул склад в Китае", field: "chinaDepartedNotifiedAt" },
    almaty_arrived: { title: "🇰🇿 Ваш товар прибыл на сортировочный пункт в Алматы.", status: "На сортировке в Алматы", field: "almatyArrivedNotifiedAt" },
    almaty_departed: { title: "🚚 Ваш товар покинул сортировочный пункт в Алматы.", status: "Покинул Алматы", field: "almatyDepartedNotifiedAt" },
    astana_arrived: { title: "✅ Ваш товар прибыл на склад в Астане.", status: "В Астане на складе", field: "astanaArrivedNotifiedAt" },
  };
  return stages[stage] || stages.china_warehouse;
}

function invoiceNotificationText(invoice: Record<string, unknown>, client: CflowClient, items: Record<string, unknown>[], stage = "china_warehouse") {
  const stageInfo = invoiceStageInfo(stage);
  const packagesCount = items.reduce((sum, item) => sum + positiveInt(item.packageCount || "1"), 0);
  const lines = items.map((item, index) => {
    const title = String(item.title || item.description || "").trim();
    const track = String(item.track || item.boxId || `место ${index + 1}`).trim();
    const quantity = String(item.quantity || "").trim();
    const packageCount = positiveInt(item.packageCount || "1");
    const weight = String(item.weight || "").trim();
    return `• ${title ? `${escapeHtml(title)} — ` : ""}${escapeHtml(track)}${quantity ? `, ${escapeHtml(quantity)} шт.` : ""}${packageCount > 1 ? `, мест: ${packageCount}` : ""}${weight ? `, ${escapeHtml(weight)} кг` : ""}`;
  });
  return [
    stageInfo.title,
    "",
    `Клиент: <b>${escapeHtml(client.name)}</b>`,
    `Накладная: <b>${escapeHtml(invoice.number || invoice.id || "")}</b>`,
    `Количество мест: <b>${packagesCount}</b>`,
    "",
    ...lines,
    "",
    `Статус уже отображается в кабинете: ${escapeHtml(stageInfo.status)}.`,
  ].join("\n");
}

async function notifyInvoiceClients(env: Env, request: Request, invoiceId: string, stage = "china_warehouse") {
  const entity = await findInvoice(env, invoiceId);
  const invoice = invoicePayload(entity);
  if (!invoice) throw new Error("Накладная не найдена");
  const items = invoiceItems(invoice);
  const stageInfo = invoiceStageInfo(stage);
  const clients = await listClients(env);
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const groups = new Map<string, { client: CflowClient; items: Record<string, unknown>[] }>();

  for (const item of items) {
    if (item[stageInfo.field]) continue;
    const client = clientsById.get(String(item.clientId || "")) || await findClient(env, { clientCode: String(item.clientCode || "") });
    if (!client?.telegram_id) continue;
    const group = groups.get(client.id) || { client, items: [] };
    group.items.push(item);
    groups.set(client.id, group);
  }

  let sent = 0;
  const notifiedItemIds = new Set<string>();
  for (const group of groups.values()) {
    const result = await telegramApi(env, "sendMessage", {
      chat_id: group.client.telegram_id,
      parse_mode: "HTML",
      text: invoiceNotificationText(invoice, group.client, group.items, stage),
      reply_markup: telegramReplyKeyboard(clientWebAppUrl(request, env)),
    });
    if ((result as { ok?: boolean }).ok) {
      sent += 1;
      group.items.forEach((item) => notifiedItemIds.add(String(item.id || item.boxId || item.track || "")));
    }
  }

  const now = nowIso();
  for (const item of items) {
    const key = String(item.id || item.boxId || item.track || "");
    if (!notifiedItemIds.has(key)) continue;
    const itemBoxIds = Array.isArray(item.boxIds) && item.boxIds.length ? item.boxIds.map(String).filter(Boolean) : String(item.boxId || "") ? [String(item.boxId)] : [];
    for (const boxId of itemBoxIds) {
      const box = await findBox(env, boxId);
      if (!box) continue;
      await upsertBox(env, {
        ...toDesktopBox(box),
        status: stageInfo.status,
        updatedAt: now,
      });
    }
  }
  const nextItems = items.map((item) => {
    const key = String(item.id || item.boxId || item.track || "");
    return notifiedItemIds.has(key) ? { ...item, [stageInfo.field]: now, notifiedAt: now, status: stageInfo.status } : item;
  });
  const nextInvoice = {
    ...invoice,
    status: sent > 0 ? "notified" : invoice.status,
    notifiedAt: sent > 0 ? now : invoice.notifiedAt,
    lastNotifiedStage: sent > 0 ? stage : invoice.lastNotifiedStage,
    updatedAt: now,
    items: nextItems,
  };
  await saveInvoicePayload(env, nextInvoice);
  return { invoice: nextInvoice, sent, total: groups.size };
}

function canIssueBoxes(boxes: Record<string, unknown>[]) {
  if (!boxes.length) return { ok: false, code: "not_found", text: "Товар по QR не найден" };
  if (boxes.every((box) => isBoxDelivered(box))) return { ok: false, code: "delivered", text: "Товар уже выдан" };
  const notReady = boxes.filter((box) => {
    const status = String(box.status || "").toLowerCase();
    return !status.includes("астан") && !status.includes("ждет выдачи") && !status.includes("готов");
  });
  if (notReady.length) return { ok: false, code: "not_arrived", text: "Товар еще не поступил на склад выдачи" };
  return { ok: true, code: "ready", text: "Можно выдавать" };
}
async function boxesFromClaim(env: Env, token: string) {
  const verified = await verifyClaimToken(env, token);
  if (!verified.ok) return { ok: false as const, error: verified.error };
  const boxIds = Array.isArray(verified.payload.boxIds) ? verified.payload.boxIds.map(String).filter(Boolean) : [];
  const clientId = String(verified.payload.clientId || "");
  if (!boxIds.length || !clientId) return { ok: false as const, error: "QR не содержит посылки" };
  const allBoxes = await listBoxes(env);
  const boxes = allBoxes.map(toDesktopBox).filter((box) => boxIds.includes(String(box.id || "")) && String(box.clientId || "") === clientId);
  const client = await findClient(env, { id: clientId });
  return { ok: true as const, client, boxes, payload: verified.payload };
}

async function scanClaim(env: Env, token: string, managerName = "Менеджер") {
  const resolved = await boxesFromClaim(env, token);
  if (!resolved.ok) return resolved;
  const check = canIssueBoxes(resolved.boxes);
  await upsertEntity(env, "activity", {
    id: `ACT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    time: nowIso(),
    title: "QR предъявлен",
    text: `${resolved.client?.name || "Клиент"} предъявил QR: ${check.text}`,
    user: managerName,
    updatedAt: nowIso(),
  }, "ACT");
  return {
    ok: true as const,
    status: check,
    client: resolved.client ? toDesktopClient(resolved.client) : null,
    boxes: resolved.boxes,
  };
}

async function issueClaim(env: Env, token: string, managerName = "Менеджер") {
  const scan = await scanClaim(env, token, managerName);
  if (!scan.ok) return scan;
  if (!scan.status.ok) return { ...scan, ok: false as const, error: scan.status.text };
  const now = nowIso();
  const issuedBoxes = [];
  for (const box of scan.boxes) {
    const chargeAmount = toNumber(box.chargeAmount || box.amount);
    const nextBox = {
      ...box,
      status: "Выдано",
      place: "Выдано клиенту",
      owner: managerName,
      issuedAt: now,
      chargedAt: chargeAmount > 0 && !box.chargedAt ? now : box.chargedAt || "",
      updatedAt: now,
    };
    const saved = await upsertBox(env, nextBox);
    if (saved) issuedBoxes.push(toDesktopBox(saved));
  }
  await upsertEntity(env, "activity", {
    id: `ACT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    time: now,
    title: "Выдача по QR",
    text: `${scan.client?.name || "Клиент"} получил посылки: ${issuedBoxes.map((box) => box.id).join(", ")}`,
    user: managerName,
    updatedAt: now,
  }, "ACT");
  return { ok: true as const, client: scan.client, boxes: issuedBoxes, data: await cloudSnapshot(env) };
}

async function handleClientTelegramWebhook(request: Request, env: Env) {
  if (env.CFLOW_ADMIN_TOKEN) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token") || "";
    if (secret !== env.CFLOW_ADMIN_TOKEN) return json({ ok: false, error: "Неверный webhook secret" }, { status: 403 });
  }
  const update = await request.json() as TelegramUpdate;
  const chatId = update.message?.chat?.id;
  const text = String(update.message?.text || "").trim().toLowerCase();
  if (!chatId) return json({ ok: true, skipped: true });
  if (!text || text.startsWith("/start")) {
    await sendClientLaunchMessage(env, chatId, clientWebAppUrl(request, env));
  }
  return json({ ok: true });
}

async function clientInitData(request: Request) {
  if (request.method === "POST") {
    try {
      const body = await request.json() as { initData?: string };
      return body.initData || "";
    } catch {
      return "";
    }
  }
  return new URL(request.url).searchParams.get("initData") || "";
}

async function handleMe(request: Request, env: Env) {
  const initData = await clientInitData(request);
  const verified = await verifyTelegramInitData(initData, env.CFLOW_TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  if (!verified.user?.id) return json({ ok: false, error: "Telegram пользователь не найден" }, { status: 401 });
  const telegramId = String(verified.user.id);
  const client = await findClient(env, { telegramId });
  const boxes = client ? await getBoxes(env, client) : [];
  let claim = null;
  if (client) {
    try {
      claim = await clientClaim(env, client, boxes as Record<string, unknown>[]);
    } catch {
      claim = null;
    }
  }
  return json({ ok: true, ...publicClient(client, boxes), claim });
}

async function handleClientClaim(request: Request, env: Env) {
  const initData = await clientInitData(request);
  const verified = await verifyTelegramInitData(initData, env.CFLOW_TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  if (!verified.user?.id) return json({ ok: false, error: "Telegram пользователь не найден" }, { status: 401 });
  const client = await findClient(env, { telegramId: String(verified.user.id) });
  if (!client) return json({ ok: false, error: "Клиент не найден" }, { status: 404 });
  const boxes = await getBoxes(env, client);
  const claim = await clientClaim(env, client, boxes as Record<string, unknown>[]);
  return json({ ok: true, claim });
}

async function handleRegister(request: Request, env: Env) {
  try {
    const body = await request.json() as { initData?: string; name?: string; phone?: string };
    const verified = await verifyTelegramInitData(body.initData || "", env.CFLOW_TELEGRAM_BOT_TOKEN);
    if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
    if (!verified.user?.id) return json({ ok: false, error: "Telegram пользователь не найден" }, { status: 401 });

    const telegramId = String(verified.user.id);
    const name = String(body.name || [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || verified.user.username || "Клиент").trim();
    const client = await upsertClient(env, {
      name,
      phone: body.phone || "",
      telegram: verified.user.username ? `@${verified.user.username}` : "",
      telegramId,
      registrationSource: "telegram",
      registrationStatus: "pending",
    });
    if (!client) return json({ ok: false, error: "Заявка была удалена. Напишите менеджеру для повторной регистрации." }, { status: 409 });
    await upsertEntity(env, "activity", {
      id: `ACT-REG-${telegramId}-${Date.now()}`,
      time: nowIso(),
      title: "Новая заявка",
      text: `${client.name} отправил заявку из Telegram`,
      user: client.telegram_username || telegramId,
      updatedAt: nowIso(),
    }, "ACT");
    return json({ ok: true, ...publicClient(client, await getBoxes(env, client)) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Заявка не сохранена" }, { status: 500 });
  }
}

async function handleAdminClients(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  const clients = await listClients(env);
  return json({ ok: true, clients: clients.map(toDesktopClient) });
}

async function handleAdminUpsertClient(request: Request, env: Env, ctx: ExecutionContext) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const before = await findClient(env, {
      id: String(body.id || ""),
      telegramId: String(body.telegramId || ""),
      phone: String(body.phone || ""),
      clientCode: String(body.clientCode || body.code || ""),
      name: String(body.name || body.fullName || ""),
    });
    const client = await upsertClient(env, { ...body, registrationSource: body.registrationSource || "manual", registrationStatus: body.registrationStatus || "approved" });
    if (!client) return json({ ok: false, error: "Клиент удален и не будет восстановлен старым snapshot" }, { status: 409 });
    if (shouldNotifyApproval(before, client)) ctx.waitUntil(notifyClientApproved(env, request, client));
    return json({ ok: true, client: toDesktopClient(client) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Клиент не сохранен" }, { status: 400 });
  }
}

async function handleAdminSnapshot(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  return json({ ok: true, data: await cloudSnapshot(env) });
}

async function handleAdminHealth(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  return json({ ok: true, storage: env.DB ? "d1" : "memory" });
}

async function handleAdminCreateBackup(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const backup = await createCloudBackup(env, body);
    return json({ ok: true, backupId: backup.id, createdAt: backup.created_at, checksum: backup.checksum });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Backup не сохранен" }, { status: 400 });
  }
}

async function handleAdminSyncSnapshot(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as { data?: Record<string, unknown> };
    const data = body.data || {};
    const clients = Array.isArray(data.clients) ? data.clients : [];
    const boxes = Array.isArray(data.boxes) ? data.boxes : [];
    const shipments = Array.isArray(data.shipments) ? data.shipments : [];
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const activity = Array.isArray(data.activity) ? data.activity : [];
    const clientCodes = Array.isArray(data.clientCodes) ? data.clientCodes : [];
    const staff = Array.isArray(data.staff) ? data.staff : [];
    const deletedBoxes = Array.isArray(data.deletedBoxes) ? data.deletedBoxes : [];
    const deletedClients = Array.isArray(data.deletedClients) ? data.deletedClients : [];
    const settings = data.settings && typeof data.settings === "object" ? data.settings as Record<string, unknown> : {};

    await Promise.all(deletedBoxes.map((item) => upsertDeletedBox(env, item as Record<string, unknown>)));
    await Promise.all(deletedClients.map((item) => upsertDeletedClient(env, item as Record<string, unknown>)));
    await Promise.all(clients.map((client) => upsertClient(env, client as Record<string, unknown>)));
    await Promise.all(boxes.map((box) => upsertBox(env, box as Record<string, unknown>)));
    await Promise.all(shipments.map((shipment) => upsertEntity(env, "shipments", shipment as Record<string, unknown>, "SHIP")));
    await Promise.all(invoices.map((invoice) => upsertEntity(env, "invoices", invoice as Record<string, unknown>, "INV")));
    await Promise.all(activity.map((item) => upsertEntity(env, "activity", item as Record<string, unknown>, "ACT")));
    await Promise.all(clientCodes.map((item, index) => upsertClientCode(env, item as Record<string, unknown>, index)));
    if (staff.length) await syncStaffList(env, staff as Record<string, unknown>[]);
    await saveSettings(env, settings);

    return json({ ok: true, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Snapshot не сохранен" }, { status: 400 });
  }
}

async function handleAdminStaffSync(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as { staff?: Record<string, unknown>[] };
    const staff = Array.isArray(body.staff) ? body.staff : [];
    const synced = await syncStaffList(env, staff);
    return json({ ok: true, staff: synced.map(toDesktopStaff) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Сотрудники не сохранены" }, { status: 400 });
  }
}

async function handleAdminDeleteClient(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const deleted = await deleteClient(env, String(body.clientId || body.id || ""));
    return json({ ok: true, deletedClientId: deleted.id, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Клиент не удален" }, { status: 400 });
  }
}

async function handleAdminUpsertBox(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const box = await upsertBox(env, body);
    if (!box) return json({ ok: false, error: "Коробка удалена и не будет восстановлена старым snapshot" }, { status: 409 });
    return json({ ok: true, box: toDesktopBox(box), data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Коробка не сохранена" }, { status: 400 });
  }
}

async function handleAdminDeleteBox(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  const body = await request.json() as { boxId?: string; id?: string; reason?: string };
  await upsertDeletedBox(env, { id: String(body.boxId || body.id || ""), reason: body.reason || "", deletedAt: nowIso() });
  return json({ ok: true, data: await cloudSnapshot(env) });
}

async function handleAdminUpsertInvoice(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const invoice = body.invoice && typeof body.invoice === "object" ? body.invoice as Record<string, unknown> : body;
    const saved = await saveInvoicePayload(env, invoice);
    return json({ ok: true, invoice: toDesktopEntity(saved), data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Накладная не сохранена" }, { status: 400 });
  }
}

async function handleAdminConfirmInvoice(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as { invoiceId?: string; id?: string };
    const invoice = await confirmInvoice(env, String(body.invoiceId || body.id || ""));
    return json({ ok: true, invoice, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Накладная не подтверждена" }, { status: 400 });
  }
}

async function handleAdminNotifyInvoice(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as { invoiceId?: string; id?: string; stage?: string };
    const result = await notifyInvoiceClients(env, request, String(body.invoiceId || body.id || ""), String(body.stage || "china_warehouse"));
    return json({ ok: true, sent: result.sent, total: result.total, invoice: result.invoice, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Уведомления не отправлены" }, { status: 400 });
  }
}

async function handleAdminArriveInvoice(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as { invoiceId?: string; id?: string; user?: string };
    const invoice = await arriveInvoice(env, String(body.invoiceId || body.id || ""), String(body.user || "Desktop"));
    return json({ ok: true, invoice, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Поступление не отмечено" }, { status: 400 });
  }
}

async function handleManageMe(request: Request, env: Env) {
  const initData = new URL(request.url).searchParams.get("initData") || "";
  const verified = await verifyManageInitData(initData, env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  return json({ ok: true, user: verified.user });
}

async function handleManageClients(request: Request, env: Env) {
  const initData = new URL(request.url).searchParams.get("initData") || "";
  const verified = await verifyManageInitData(initData, env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  const clients = await listClients(env);
  const clientCodes = await listClientCodes(env);
  return json({ ok: true, clients: clients.map(toDesktopClient), clientCodes: clientCodes.map(toDesktopClientCode), settings: await getSettings(env) });
}

async function handleManageIssueClientCode(request: Request, env: Env, ctx: ExecutionContext) {
  const body = await request.json() as { initData?: string; clientId?: string; telegramId?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  try {
    const before = await findClient(env, { id: String(body.clientId || ""), telegramId: String(body.telegramId || "") });
    const client = await issueCodeToClient(env, { id: body.clientId, telegramId: body.telegramId });
    if (shouldNotifyApproval(before, client)) ctx.waitUntil(notifyClientApproved(env, request, client));
    return json({ ok: true, client: toDesktopClient(client), data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Код не выдан" }, { status: 400 });
  }
}

async function handleManageApproveClient(request: Request, env: Env, ctx: ExecutionContext) {
  const body = await request.json() as { initData?: string; clientId?: string; telegramId?: string; clientCode?: string; chinaAddress?: string; comments?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  const existing = await findClient(env, { id: String(body.clientId || ""), telegramId: String(body.telegramId || "") });
  if (!existing) return json({ ok: false, error: "Клиент не найден" }, { status: 404 });
  const client = await upsertClient(env, {
    ...toDesktopClient(existing),
    clientCode: body.clientCode || existing.client_code,
    chinaAddress: body.chinaAddress || existing.china_address,
    comments: body.comments || existing.comments,
    registrationStatus: existing.registration_status,
  });
  if (!client) return json({ ok: false, error: "Клиент удален" }, { status: 409 });
  if (shouldNotifyApproval(existing, client)) ctx.waitUntil(notifyClientApproved(env, request, client));
  return json({ ok: true, client: toDesktopClient(client) });
}

async function handleManageDeleteClient(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; clientId?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  try {
    const deleted = await deleteClient(env, String(body.clientId || ""));
    return json({ ok: true, deletedClientId: deleted.id, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Клиент не удален" }, { status: 400 });
  }
}

async function handleManageInvoices(request: Request, env: Env) {
  const initData = new URL(request.url).searchParams.get("initData") || "";
  const verified = await verifyManageInitData(initData, env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  const invoices = (await listEntities(env, "invoices")).map(toDesktopEntity);
  return json({ ok: true, invoices });
}

async function handleManageConfirmInvoice(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; invoiceId?: string; id?: string; stage?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  try {
    const invoice = await confirmInvoice(env, String(body.invoiceId || body.id || ""));
    return json({ ok: true, invoice, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Накладная не подтверждена" }, { status: 400 });
  }
}

async function handleManageNotifyInvoice(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; invoiceId?: string; id?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  try {
    const result = await notifyInvoiceClients(env, request, String(body.invoiceId || body.id || ""), String(body.stage || "china_warehouse"));
    return json({ ok: true, sent: result.sent, total: result.total, invoice: result.invoice, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Уведомления не отправлены" }, { status: 400 });
  }
}

async function handleManageArriveInvoice(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; invoiceId?: string; id?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  try {
    const invoice = await arriveInvoice(env, String(body.invoiceId || body.id || ""), verified.user.username || "Manager");
    return json({ ok: true, invoice, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Поступление не отмечено" }, { status: 400 });
  }
}

async function handleManageScanClaim(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; token?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  const result = await scanClaim(env, String(body.token || ""), verified.user.username || "Manager");
  return json(result, { status: result.ok ? 200 : 400 });
}

async function handleAdminScanClaim(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  const body = await request.json() as { token?: string; user?: string };
  const result = await scanClaim(env, String(body.token || ""), String(body.user || "Desktop"));
  return json(result, { status: result.ok ? 200 : 400 });
}

async function handleManageIssueClaim(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; token?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  const result = await issueClaim(env, String(body.token || ""), verified.user.username || "Manager");
  return json(result, { status: result.ok ? 200 : 400 });
}

async function handleManageBroadcast(request: Request, env: Env) {
  const body = await request.json() as {
    initData?: string;
    audience?: BroadcastAudience;
    title?: string;
    message?: string;
    imageData?: string;
  };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });

  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  const imageData = String(body.imageData || "");
  const audience = body.audience === "telegram" || body.audience === "pending" ? body.audience : "approved";
  if (!title && !message) return json({ ok: false, error: "Добавьте заголовок или текст сообщения" }, { status: 400 });
  if (imageData && !parseDataUrl(imageData)) return json({ ok: false, error: "Неверный формат изображения" }, { status: 400 });

  const clients = await listClients(env);
  const recipients = broadcastRecipients(clients, audience);
  if (!recipients.length) return json({ ok: false, error: "Нет получателей с Telegram" }, { status: 400 });

  let sent = 0;
  for (const client of recipients) {
    try {
      const result = await sendBroadcastMessage(env, request, client, { title, message, imageData });
      if ((result as { ok?: boolean }).ok) sent += 1;
    } catch {
      // Keep sending to the next client; the response returns the final delivery count.
    }
  }

  return json({ ok: sent > 0, sent, total: recipients.length });
}

async function handleApprove(request: Request, env: Env, ctx: ExecutionContext) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  const body = await request.json() as { telegramId?: string; clientCode?: string; chinaAddress?: string };
  const existing = await findClient(env, { telegramId: String(body.telegramId || "") });
  if (!existing) return json({ ok: false, error: "Клиент не найден" }, { status: 404 });
  const client = await upsertClient(env, {
    ...toDesktopClient(existing),
    clientCode: body.clientCode || existing.client_code,
    chinaAddress: body.chinaAddress || existing.china_address,
    registrationStatus: "approved",
  });
  if (!client) return json({ ok: false, error: "Клиент удален" }, { status: 409 });
  if (shouldNotifyApproval(existing, client)) ctx.waitUntil(notifyClientApproved(env, request, client));
  return json({ ok: true, ...publicClient(client, await getBoxes(env, client)) });
}

async function handleConfigure(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  const origin = new URL(request.url).origin;
  const clientWebAppUrl = env.CFLOW_TELEGRAM_WEBAPP_URL || `${origin}/`;
  const manageWebAppUrl = `${origin}/manage`;
  const results: Record<string, unknown> = {};

  if (env.CFLOW_TELEGRAM_BOT_TOKEN) {
    const clientResponse = await fetch(`https://api.telegram.org/bot${env.CFLOW_TELEGRAM_BOT_TOKEN}/setChatMenuButton`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ menu_button: { type: "web_app", text: "Zabota GO", web_app: { url: clientWebAppUrl } } }),
    });
    const webhookResponse = await fetch(`https://api.telegram.org/bot${env.CFLOW_TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        url: `${origin}/api/telegram/client-webhook`,
        secret_token: env.CFLOW_ADMIN_TOKEN || undefined,
        allowed_updates: ["message"],
      }),
    });
    results.client = { menu: await clientResponse.json(), webhook: await webhookResponse.json() };
  }

  if (env.CFLOW_MANAGE_TELEGRAM_BOT_TOKEN) {
    const manageResponse = await fetch(`https://api.telegram.org/bot${env.CFLOW_MANAGE_TELEGRAM_BOT_TOKEN}/setChatMenuButton`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ menu_button: { type: "web_app", text: "Zabota GO", web_app: { url: manageWebAppUrl } } }),
    });
    results.manage = await manageResponse.json();
  }

  const ok = Boolean(
    (results.client as { menu?: { ok?: boolean }; webhook?: { ok?: boolean } } | undefined)?.menu?.ok ||
    (results.client as { menu?: { ok?: boolean }; webhook?: { ok?: boolean } } | undefined)?.webhook?.ok ||
    (results.manage as { ok?: boolean } | undefined)?.ok,
  );
  return json({ ok, clientWebAppUrl, manageWebAppUrl, telegram: results }, { status: ok ? 200 : 502 });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/client/me" && (request.method === "GET" || request.method === "POST")) return handleMe(request, env);
    if (url.pathname === "/api/client/claim" && (request.method === "GET" || request.method === "POST")) return handleClientClaim(request, env);
    if (url.pathname === "/api/client/register" && request.method === "POST") return handleRegister(request, env);
    if (url.pathname === "/api/admin/clients" && request.method === "GET") return handleAdminClients(request, env);
    if (url.pathname === "/api/admin/clients/upsert" && request.method === "POST") return handleAdminUpsertClient(request, env, ctx);
    if (url.pathname === "/api/admin/snapshot" && request.method === "GET") return handleAdminSnapshot(request, env);
    if (url.pathname === "/api/admin/health" && request.method === "GET") return handleAdminHealth(request, env);
    if (url.pathname === "/api/admin/backups/create" && request.method === "POST") return handleAdminCreateBackup(request, env);
    if (url.pathname === "/api/admin/snapshot/sync" && request.method === "POST") return handleAdminSyncSnapshot(request, env);
    if (url.pathname === "/api/admin/staff/sync" && request.method === "POST") return handleAdminStaffSync(request, env);
    if (url.pathname === "/api/admin/boxes/upsert" && request.method === "POST") return handleAdminUpsertBox(request, env);
    if (url.pathname === "/api/admin/boxes/delete" && request.method === "POST") return handleAdminDeleteBox(request, env);
    if (url.pathname === "/api/admin/invoices/upsert" && request.method === "POST") return handleAdminUpsertInvoice(request, env);
    if (url.pathname === "/api/admin/invoices/confirm" && request.method === "POST") return handleAdminConfirmInvoice(request, env);
    if (url.pathname === "/api/admin/invoices/arrive" && request.method === "POST") return handleAdminArriveInvoice(request, env);
    if (url.pathname === "/api/admin/invoices/notify" && request.method === "POST") return handleAdminNotifyInvoice(request, env);
    if (url.pathname === "/api/admin/clients/delete" && request.method === "POST") return handleAdminDeleteClient(request, env);
    if (url.pathname === "/api/admin/claims/scan" && request.method === "POST") return handleAdminScanClaim(request, env);
    if (url.pathname === "/api/admin/telegram-clients/approve" && request.method === "POST") return handleApprove(request, env, ctx);
    if (url.pathname === "/api/manage/me" && request.method === "GET") return handleManageMe(request, env);
    if (url.pathname === "/api/manage/clients" && request.method === "GET") return handleManageClients(request, env);
    if (url.pathname === "/api/manage/clients/issue-code" && request.method === "POST") return handleManageIssueClientCode(request, env, ctx);
    if (url.pathname === "/api/manage/clients/approve" && request.method === "POST") return handleManageApproveClient(request, env, ctx);
    if (url.pathname === "/api/manage/clients/delete" && request.method === "POST") return handleManageDeleteClient(request, env);
    if (url.pathname === "/api/manage/invoices" && request.method === "GET") return handleManageInvoices(request, env);
    if (url.pathname === "/api/manage/invoices/confirm" && request.method === "POST") return handleManageConfirmInvoice(request, env);
    if (url.pathname === "/api/manage/invoices/arrive" && request.method === "POST") return handleManageArriveInvoice(request, env);
    if (url.pathname === "/api/manage/invoices/notify" && request.method === "POST") return handleManageNotifyInvoice(request, env);
    if (url.pathname === "/api/manage/claims/scan" && request.method === "POST") return handleManageScanClaim(request, env);
    if (url.pathname === "/api/manage/claims/issue" && request.method === "POST") return handleManageIssueClaim(request, env);
    if (url.pathname === "/api/manage/broadcast" && request.method === "POST") return handleManageBroadcast(request, env);
    if (url.pathname === "/api/telegram/configure" && request.method === "POST") return handleConfigure(request, env);
    if (url.pathname === "/api/telegram/client-webhook" && request.method === "POST") return handleClientTelegramWebhook(request, env);
    return handler.fetch(request, env, ctx);
  },
};

export default worker;

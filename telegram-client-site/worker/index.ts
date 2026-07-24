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

const memoryClients = new Map<string, CflowClient>();
const memoryBoxes = new Map<string, CflowBox>();
const memoryShipments = new Map<string, CflowStoredEntity>();
const memoryActivity = new Map<string, CflowStoredEntity>();
const memoryClientCodes = new Map<string, CflowClientCode>();
const memorySettings = new Map<string, string>();

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

function normalizeId(value = "") {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function makeClientId() {
  return `CL-${String(memoryClients.size + 1).padStart(6, "0")}`;
}

function makeBoxId() {
  return `CF-${String(memoryBoxes.size + 1).padStart(6, "0")}`;
}

function toNumber(value: unknown) {
  const parsed = Number(String(value || "").replace(/\s+/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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
    clientCode: String(input.clientCode || existingPayload.clientCode || existing?.client_code || "").trim(),
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
    clientCode: box.client_code,
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
  const username = String(verified.user.username || "").replace(/^@/, "").toLowerCase();
  if (!username || !allowed.includes(username)) {
    return { ok: false as const, error: "Нет доступа к управлению CFlow" };
  }
  return verified;
}

async function ensureTables(db?: D1Database) {
  if (!db) return;
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
      code: client.client_code,
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
    clientCode: client.client_code,
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
  return {
    id,
    name: String(input.name || input.fullName || existing?.name || "").trim(),
    phone: String(input.phone || existing?.phone || "").trim(),
    telegram_username: String(input.telegram || input.telegramUsername || existing?.telegram_username || "").trim(),
    telegram_id: String(input.telegramId || existing?.telegram_id || "").trim(),
    comments: String(input.comments || input.comment || existing?.comments || "").trim(),
    client_code: String(input.clientCode || input.code || existing?.client_code || "").trim(),
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
  const clientCode = normalizeId(query.clientCode);
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

async function upsertClient(env: Env, input: Record<string, unknown>) {
  const existing = await findClient(env, {
    id: String(input.id || ""),
    telegramId: String(input.telegramId || ""),
    phone: String(input.phone || ""),
    clientCode: String(input.clientCode || input.code || ""),
    name: String(input.name || input.fullName || ""),
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

async function findBox(env: Env, id: string) {
  await ensureTables(env.DB);
  const cleanId = normalizeId(id);
  if (!cleanId) return null;
  if (!env.DB) return memoryBoxes.get(cleanId) || null;
  return await env.DB.prepare("SELECT * FROM boxes WHERE id = ?").bind(cleanId).first<CflowBox>();
}

async function upsertBox(env: Env, input: Record<string, unknown>) {
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
  memoryBoxes.delete(cleanId);
  if (!env.DB) return;
  await ensureTables(env.DB);
  await env.DB.prepare("DELETE FROM boxes WHERE id = ?").bind(cleanId).run();
}

async function listBoxes(env: Env) {
  await ensureTables(env.DB);
  if (!env.DB) return [...memoryBoxes.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const result = await env.DB.prepare("SELECT * FROM boxes ORDER BY updated_at DESC").all<CflowBox>();
  return result.results || [];
}

async function upsertEntity(env: Env, table: "shipments" | "activity", input: Record<string, unknown>, prefix: string) {
  await ensureTables(env.DB);
  const id = String(input.id || "").trim();
  let existing: CflowStoredEntity | null = null;
  const memory = table === "shipments" ? memoryShipments : memoryActivity;
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
    INSERT INTO shipments (id, updated_at, payload)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload
  `).bind(entity.id, entity.updated_at, entity.payload).run();
  return entity;
}

async function listEntities(env: Env, table: "shipments" | "activity") {
  await ensureTables(env.DB);
  const memory = table === "shipments" ? memoryShipments : memoryActivity;
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
  const code = String(input.code || input.clientCode || "").trim();
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
  await env.DB.prepare(`
    INSERT INTO client_codes (id, code, status, client_id, client_name, assigned_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
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
  if (!env.DB) return { chinaAddress: memorySettings.get("chinaAddress") || "" };
  const result = await env.DB.prepare("SELECT key, value FROM app_settings").all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  (result.results || []).forEach((item) => {
    settings[item.key] = item.value;
  });
  return { chinaAddress: settings.chinaAddress || "" };
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

async function issueCodeToClient(env: Env, query: { id?: string; telegramId?: string }) {
  const existing = await findClient(env, { id: String(query.id || ""), telegramId: String(query.telegramId || "") });
  if (!existing) throw new Error("Клиент не найден");
  const settings = await getSettings(env);
  const chinaAddress = String(settings.chinaAddress || "").trim();
  if (!chinaAddress) throw new Error("Сначала задайте адрес склада в CFlow");

  let nextCode = existing.client_code;
  if (!nextCode) {
    await ensureTables(env.DB);
    let codeItem: CflowClientCode | null = null;
    if (env.DB) {
      codeItem = await env.DB.prepare("SELECT * FROM client_codes WHERE status = 'available' AND client_id = '' ORDER BY created_at ASC LIMIT 1").first<CflowClientCode>();
    } else {
      codeItem = [...memoryClientCodes.values()].find((item) => item.status === "available" && !item.client_id) || null;
    }
    if (!codeItem) throw new Error("Свободные коды закончились");
    nextCode = codeItem.code;
    const now = nowIso();
    codeItem.status = "assigned";
    codeItem.client_id = existing.id;
    codeItem.client_name = existing.name;
    codeItem.assigned_at = now;
    codeItem.updated_at = now;
    memoryClientCodes.set(codeItem.code.toLowerCase(), codeItem);
    if (env.DB) {
      await env.DB.prepare("UPDATE client_codes SET status = 'assigned', client_id = ?, client_name = ?, assigned_at = ?, updated_at = ? WHERE code = ?")
        .bind(existing.id, existing.name, now, now, codeItem.code)
        .run();
    }
  }

  return await upsertClient(env, {
    ...toDesktopClient(existing),
    clientCode: nextCode,
    chinaAddress: existing.china_address || chinaAddress,
    registrationStatus: "approved",
  });
}

function boxStage(status: string) {
  const value = String(status || "").toLowerCase();
  if (value.includes("выдан")) return "astana";
  if (value.includes("астан") || value.includes("ждет выдачи") || value.includes("прибыл")) return "astana";
  if (value.includes("казахстан") || value.includes("тамож")) return "kazakhstan";
  if (value.includes("пути") || value.includes("отправ")) return "road";
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
    amount: amount ? `${amount} ₸` : "",
    clientRate: clientRate ? `${clientRate} ₸/кг` : "",
    status: String(payload.status || box.status || ""),
    stage: boxStage(String(payload.status || box.status || "")),
    updated_at: String(payload.updatedAt || box.updated_at),
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
  const activity = (await listEntities(env, "activity")).map(toDesktopEntity);
  const clientCodes = (await listClientCodes(env)).map(toDesktopClientCode);
  const settings = await getSettings(env);
  return {
    clients: clients.map(toDesktopClient),
    boxes,
    shipments,
    warehouse: deriveWarehouse(boxes),
    finances: deriveFinances(boxes),
    activity,
    clientCodes,
    settings,
  };
}

function requireAdmin(request: Request, env: Env) {
  const auth = request.headers.get("authorization") || "";
  return Boolean(env.CFLOW_ADMIN_TOKEN && auth === `Bearer ${env.CFLOW_ADMIN_TOKEN}`);
}

async function handleMe(request: Request, env: Env) {
  const initData = new URL(request.url).searchParams.get("initData") || "";
  const verified = await verifyTelegramInitData(initData, env.CFLOW_TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  if (!verified.user?.id) return json({ ok: false, error: "Telegram пользователь не найден" }, { status: 401 });
  const telegramId = String(verified.user.id);
  const client = await findClient(env, { telegramId });
  return json({ ok: true, ...publicClient(client, client ? await getBoxes(env, client) : []) });
}

async function handleRegister(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; name?: string; phone?: string };
  const verified = await verifyTelegramInitData(body.initData || "", env.CFLOW_TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  if (!verified.user?.id) return json({ ok: false, error: "Telegram пользователь не найден" }, { status: 401 });

  const telegramId = String(verified.user.id);
  const client = await upsertClient(env, {
    name: body.name || [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || verified.user.username || "Клиент",
    phone: body.phone || "",
    telegram: verified.user.username ? `@${verified.user.username}` : "",
    telegramId,
    registrationSource: "telegram",
  });
  return json({ ok: true, ...publicClient(client, await getBoxes(env, client)) });
}

async function handleAdminClients(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  const clients = await listClients(env);
  return json({ ok: true, clients: clients.map(toDesktopClient) });
}

async function handleAdminUpsertClient(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const client = await upsertClient(env, { ...body, registrationSource: body.registrationSource || "manual", registrationStatus: body.registrationStatus || "approved" });
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

async function handleAdminSyncSnapshot(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as { data?: Record<string, unknown> };
    const data = body.data || {};
    const clients = Array.isArray(data.clients) ? data.clients : [];
    const boxes = Array.isArray(data.boxes) ? data.boxes : [];
    const shipments = Array.isArray(data.shipments) ? data.shipments : [];
    const activity = Array.isArray(data.activity) ? data.activity : [];
    const clientCodes = Array.isArray(data.clientCodes) ? data.clientCodes : [];
    const settings = data.settings && typeof data.settings === "object" ? data.settings as Record<string, unknown> : {};

    await Promise.all(clients.map((client) => upsertClient(env, client as Record<string, unknown>)));
    await Promise.all(boxes.map((box) => upsertBox(env, box as Record<string, unknown>)));
    await Promise.all(shipments.map((shipment) => upsertEntity(env, "shipments", shipment as Record<string, unknown>, "SHIP")));
    await Promise.all(activity.map((item) => upsertEntity(env, "activity", item as Record<string, unknown>, "ACT")));
    await Promise.all(clientCodes.map((item, index) => upsertClientCode(env, item as Record<string, unknown>, index)));
    await saveSettings(env, settings);

    return json({ ok: true, data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Snapshot не сохранен" }, { status: 400 });
  }
}

async function handleAdminUpsertBox(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const box = await upsertBox(env, body);
    return json({ ok: true, box: toDesktopBox(box), data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Коробка не сохранена" }, { status: 400 });
  }
}

async function handleAdminDeleteBox(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  const body = await request.json() as { boxId?: string; id?: string };
  await deleteBox(env, String(body.boxId || body.id || ""));
  return json({ ok: true, data: await cloudSnapshot(env) });
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

async function handleManageIssueClientCode(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; clientId?: string; telegramId?: string };
  const verified = await verifyManageInitData(body.initData || "", env);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  try {
    const client = await issueCodeToClient(env, { id: body.clientId, telegramId: body.telegramId });
    return json({ ok: true, client: toDesktopClient(client), data: await cloudSnapshot(env) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Код не выдан" }, { status: 400 });
  }
}

async function handleManageApproveClient(request: Request, env: Env) {
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
  return json({ ok: true, client: toDesktopClient(client) });
}

async function handleApprove(request: Request, env: Env) {
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
  return json({ ok: true, ...publicClient(client, await getBoxes(env, client)) });
}

async function handleConfigure(request: Request, env: Env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  if (!env.CFLOW_TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Нет токена Telegram" }, { status: 500 });
  const webAppUrl = env.CFLOW_TELEGRAM_WEBAPP_URL || `${new URL(request.url).origin}/`;
  const response = await fetch(`https://api.telegram.org/bot${env.CFLOW_TELEGRAM_BOT_TOKEN}/setChatMenuButton`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ menu_button: { type: "web_app", text: "Кабинет", web_app: { url: webAppUrl } } }),
  });
  return json({ ok: response.ok, webAppUrl, telegram: await response.json() }, { status: response.ok ? 200 : 502 });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/client/me" && request.method === "GET") return handleMe(request, env);
    if (url.pathname === "/api/client/register" && request.method === "POST") return handleRegister(request, env);
    if (url.pathname === "/api/admin/clients" && request.method === "GET") return handleAdminClients(request, env);
    if (url.pathname === "/api/admin/clients/upsert" && request.method === "POST") return handleAdminUpsertClient(request, env);
    if (url.pathname === "/api/admin/snapshot" && request.method === "GET") return handleAdminSnapshot(request, env);
    if (url.pathname === "/api/admin/health" && request.method === "GET") return handleAdminHealth(request, env);
    if (url.pathname === "/api/admin/snapshot/sync" && request.method === "POST") return handleAdminSyncSnapshot(request, env);
    if (url.pathname === "/api/admin/boxes/upsert" && request.method === "POST") return handleAdminUpsertBox(request, env);
    if (url.pathname === "/api/admin/boxes/delete" && request.method === "POST") return handleAdminDeleteBox(request, env);
    if (url.pathname === "/api/admin/telegram-clients/approve" && request.method === "POST") return handleApprove(request, env);
    if (url.pathname === "/api/manage/me" && request.method === "GET") return handleManageMe(request, env);
    if (url.pathname === "/api/manage/clients" && request.method === "GET") return handleManageClients(request, env);
    if (url.pathname === "/api/manage/clients/issue-code" && request.method === "POST") return handleManageIssueClientCode(request, env);
    if (url.pathname === "/api/manage/clients/approve" && request.method === "POST") return handleManageApproveClient(request, env);
    if (url.pathname === "/api/telegram/configure" && request.method === "POST") return handleConfigure(request, env);
    return handler.fetch(request, env, ctx);
  },
};

export default worker;

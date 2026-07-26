const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const { validateSession } = require("./users-store.cjs");

const CLIENT_CODE_STATIC_PREFIX = "奇瑞QR";
const CLIENT_CODE_LEGACY_STATIC_PREFIX = "奇瑞QR 18911759229";
const CLIENT_CODE_CITY_PREFIX = "AST";
const CLIENT_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CLIENT_CODE_MAX_NUMBER = 999;
const CLIENT_CODE_CAPACITY = CLIENT_CODE_ALPHABET.length * CLIENT_CODE_MAX_NUMBER;
const DEFAULT_CHINA_ADDRESS = "18911759229 浙江省金华市义乌市后宅街道金城一期商城大道F158号拼多多驿站-5697库-奇瑞";

function dataDir(app) {
  return path.join(app.getPath("appData"), "CFlow");
}

function storePath(app) {
  return path.join(dataDir(app), "cflow-data.json");
}

function nowIso() {
  return new Date().toISOString();
}

function displayTime(iso = nowIso()) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function makeId(prefix, _count) {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

function toNumber(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCorruptText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/[\uFFFD]/.test(text)) return true;
  if (/[РС][\u0080-\u00BF]/.test(text)) return true;
  const questionMarks = (text.match(/\?/g) || []).length;
  return questionMarks >= 2 && questionMarks / text.length > 0.2;
}

function cleanName(value, fallback = "") {
  const name = String(value || "").trim();
  return name && !isCorruptText(name) ? name : fallback;
}

function cleanDisplayText(value, fallback = "") {
  const text = String(value || "").trim();
  return text && !isCorruptText(text) ? text : fallback;
}

function cleanActivityForDisplay(item) {
  const title = cleanDisplayText(item?.title, "Старая запись истории");
  const text = cleanDisplayText(
    item?.text,
    "Эта запись была сохранена в старой кодировке. Новые действия будут отображаться нормально.",
  );
  const user = cleanDisplayText(item?.user, "Система");
  return {
    ...item,
    title,
    text,
    user,
    displayTime: displayTime(item?.time),
  };
}

function codeSuffixFromIndex(index) {
  const letter = CLIENT_CODE_ALPHABET[Math.floor(index / CLIENT_CODE_MAX_NUMBER)];
  const number = (index % CLIENT_CODE_MAX_NUMBER) + 1;
  if (!letter) return "";
  return `${CLIENT_CODE_CITY_PREFIX} ${letter}${String(number).padStart(3, "0")}`;
}

function fullClientCodeFromIndex(index) {
  const suffix = codeSuffixFromIndex(index);
  return suffix ? `${CLIENT_CODE_STATIC_PREFIX} ${suffix}` : "";
}

function normalizeGeneratedClientCode(value) {
  const code = String(value || "").trim().replace(/\s+/g, " ");
  if (!code) return "";
  return code.replace(new RegExp(`^${CLIENT_CODE_LEGACY_STATIC_PREFIX}\\s+`, "i"), `${CLIENT_CODE_STATIC_PREFIX} `);
}

function generatedCodeIndex(value) {
  const match = normalizeGeneratedClientCode(value).match(/AST\s+([A-Z])(\d{3})$/i);
  if (!match) return -1;
  const letterIndex = CLIENT_CODE_ALPHABET.indexOf(match[1].toUpperCase());
  const number = Number(match[2]);
  if (letterIndex < 0 || number < 1 || number > CLIENT_CODE_MAX_NUMBER) return -1;
  return letterIndex * CLIENT_CODE_MAX_NUMBER + number - 1;
}

function generateNextClientCode(data) {
  const used = new Set();
  (data.clients || []).forEach((client) => {
    if (client.clientCode) used.add(normalizeGeneratedClientCode(client.clientCode).toLowerCase());
  });
  (data.clientCodes || []).forEach((item) => {
    if (item.status === "assigned" || item.clientId) used.add(normalizeGeneratedClientCode(item.code).toLowerCase());
  });

  for (let index = 0; index < CLIENT_CODE_CAPACITY; index += 1) {
    const code = fullClientCodeFromIndex(index);
    if (code && !used.has(code.toLowerCase())) return code;
  }
  throw new Error("Лимит кодов AST исчерпан");
}

function readWindowsUserEnv(name) {
  if (process.platform !== "win32") return "";
  try {
    const output = execFileSync("reg", ["query", "HKCU\\Environment", "/v", name], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const line = output.split(/\r?\n/).find((item) => item.includes(name));
    return String(line || "").trim().split(/\s{2,}/).pop() || "";
  } catch {
    return "";
  }
}

function cloudConfig() {
  const adminToken = String(process.env.CFLOW_ADMIN_TOKEN || readWindowsUserEnv("CFLOW_ADMIN_TOKEN") || "");
  return {
    apiUrl: String(process.env.CFLOW_CLOUD_API_URL || process.env.CFLOW_API_URL || readWindowsUserEnv("CFLOW_CLOUD_API_URL") || "https://cflow-miniapp.yegor-sarayev.workers.dev").replace(/\/+$/, ""),
    adminToken,
  };
}

function httpJsonRequest(targetUrl, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const body = options.body || "";
    const request = https.request(targetUrl, {
      method: options.method || "GET",
      headers: {
        ...(options.headers || {}),
        ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
      },
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        raw += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          finish({ ok: false, error: `cloud_http_${response.statusCode}` });
          return;
        }
        try {
          finish(JSON.parse(raw));
        } catch {
          finish({ ok: false, error: "cloud_bad_json" });
        }
      });
    });
    request.setTimeout(15000, () => {
      request.destroy();
      finish({ ok: false, error: "cloud_timeout" });
    });
    request.on("error", () => finish({ ok: false, error: "cloud_request_failed" }));
    if (body) request.write(body);
    request.end();
  });
}

async function cloudRequest(pathname, options = {}) {
  const { apiUrl, adminToken } = cloudConfig();
  if (!apiUrl || !adminToken) {
    return { ok: false, error: !adminToken ? "cloud_token_missing" : "cloud_unavailable" };
  }

  try {
    const targetUrl = `${apiUrl}${pathname}`;
    const requestOptions = {
      ...options,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
        ...(options.headers || {}),
      },
    };
    if (typeof fetch !== "function") return await httpJsonRequest(targetUrl, requestOptions);
    const response = await fetch(`${apiUrl}${pathname}`, {
      ...requestOptions,
    });
    if (!response.ok) return { ok: false, error: `cloud_http_${response.status}` };
    return await response.json();
  } catch {
    return { ok: false, error: "cloud_request_failed" };
  }
}

async function fetchCurrencyRates() {
  const result = await httpJsonRequest("https://open.er-api.com/v6/latest/USD");
  if (!result?.result || result.result !== "success" || !result.rates) {
    return { ok: false, error: result?.error || "currency_rates_unavailable" };
  }

  const usdKzt = Number(result.rates.KZT);
  const usdCny = Number(result.rates.CNY);
  if (!Number.isFinite(usdKzt) || !Number.isFinite(usdCny) || usdCny <= 0) {
    return { ok: false, error: "currency_rates_bad_payload" };
  }

  return {
    ok: true,
    source: "open.er-api.com",
    base: "USD",
    usdKzt,
    usdCny,
    cnyKzt: usdKzt / usdCny,
    fetchedAt: nowIso(),
    updatedAt: String(result.time_last_update_utc || ""),
    nextUpdateAt: String(result.time_next_update_utc || ""),
  };
}

function normalizeCloudClient(client) {
  const fallbackName = cleanName(client.telegram || client.telegramUsername) || cleanName(client.phone) || "Клиент";
  return {
    id: String(client.id || "").trim(),
    name: cleanName(client.name || client.fullName, fallbackName),
    phone: String(client.phone || "").trim(),
    telegram: String(client.telegram || client.telegramUsername || "").trim(),
    telegramId: String(client.telegramId || "").trim(),
    comments: String(client.comments || client.comment || "").trim(),
    clientCode: normalizeGeneratedClientCode(client.clientCode || client.code || ""),
    chinaAddress: String(client.chinaAddress || "").trim(),
    clientRate: toNumber(client.clientRate || client.tariff),
    chinaRate: toNumber(client.chinaRate),
    registrationSource: String(client.registrationSource || "manual").trim(),
    registrationStatus: String(client.registrationStatus || client.status || "approved").trim(),
    createdAt: String(client.createdAt || nowIso()),
    updatedAt: String(client.updatedAt || nowIso()),
  };
}

function mergeClient(data, input) {
  const next = normalizeCloudClient(input);
  if (!next.name) return false;

  const existing = data.clients.find((client) =>
    (next.telegramId && client.telegramId === next.telegramId) ||
    (next.phone && client.phone === next.phone) ||
    (next.clientCode && client.clientCode === next.clientCode) ||
    client.name.toLowerCase() === next.name.toLowerCase(),
  );

  if (existing) {
    Object.assign(existing, {
      ...existing,
      ...next,
      id: existing.id || next.id || makeId("CL", data.clients.length),
      clientCode: next.clientCode || existing.clientCode || "",
      chinaAddress: next.chinaAddress || existing.chinaAddress || "",
      clientRate: next.clientRate || existing.clientRate || 0,
      chinaRate: next.chinaRate || existing.chinaRate || 0,
      comments: next.comments || existing.comments || "",
    });
    return true;
  }

  data.clients.unshift({
    ...next,
    id: next.id || makeId("CL", data.clients.length),
  });
  return true;
}

function newerOrEqual(nextTime, currentTime) {
  const next = Date.parse(nextTime || "");
  const current = Date.parse(currentTime || "");
  if (!Number.isFinite(next)) return true;
  if (!Number.isFinite(current)) return true;
  return next >= current;
}

function mergeById(items, incoming) {
  let changed = false;
  const list = Array.isArray(incoming) ? incoming : [];
  list.forEach((next) => {
    const id = String(next?.id || "").trim();
    if (!id) return;
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      items.unshift(next);
      changed = true;
      return;
    }
    if (newerOrEqual(next.updatedAt || next.time, items[index].updatedAt || items[index].time)) {
      items[index] = { ...items[index], ...next };
      changed = true;
    }
  });
  return changed;
}

function normalizeClientCode(value) {
  return String(value || "").trim();
}

function normalizeClientCodeItem(input, count = 0) {
  const now = nowIso();
  const code = normalizeGeneratedClientCode(normalizeClientCode(input?.code || input?.clientCode || input));
  const clientId = String(input?.clientId || "").trim();
  const status = String(input?.status || (clientId ? "assigned" : "available")).trim();
  return {
    id: String(input?.id || `CC-${String(count + 1).padStart(6, "0")}`).trim(),
    code,
    status: status === "assigned" ? "assigned" : "available",
    clientId,
    clientName: String(input?.clientName || "").trim(),
    assignedAt: String(input?.assignedAt || ""),
    createdAt: String(input?.createdAt || now),
    updatedAt: String(input?.updatedAt || now),
  };
}

function mergeClientCodes(data, incoming) {
  let changed = false;
  const existingByCode = new Map((data.clientCodes || []).map((item) => [String(item.code || "").toLowerCase(), item]));
  (Array.isArray(incoming) ? incoming : []).forEach((item, index) => {
    const next = normalizeClientCodeItem(item, data.clientCodes.length + index);
    if (!next.code) return;
    const existing = existingByCode.get(next.code.toLowerCase());
    if (!existing) {
      data.clientCodes.unshift(next);
      existingByCode.set(next.code.toLowerCase(), next);
      changed = true;
      return;
    }
    if (newerOrEqual(next.updatedAt, existing.updatedAt)) {
      Object.assign(existing, { ...existing, ...next, id: existing.id || next.id });
      changed = true;
    }
  });
  return changed;
}

function normalizeDeletedBox(input) {
  return {
    id: String(input?.id || input?.boxId || "").trim(),
    reason: String(input?.reason || "").trim(),
    deletedAt: String(input?.deletedAt || input?.deleted_at || nowIso()),
  };
}

function mergeTombstones(items, incoming, normalize) {
  let changed = false;
  const existingById = new Map((items || []).map((item) => [String(item.id || ""), item]));
  (Array.isArray(incoming) ? incoming : []).forEach((item) => {
    const next = normalize(item);
    if (!next.id) return;
    const existing = existingById.get(next.id);
    if (!existing) {
      items.unshift(next);
      existingById.set(next.id, next);
      changed = true;
      return;
    }
    if (newerOrEqual(next.deletedAt, existing.deletedAt)) {
      Object.assign(existing, next);
      changed = true;
    }
  });
  return changed;
}

function normalizeDeletedClient(input) {
  return {
    id: String(input?.id || input?.clientId || "").trim(),
    reason: String(input?.reason || "").trim(),
    deletedAt: String(input?.deletedAt || input?.deleted_at || nowIso()),
  };
}

function mergeDeletedBoxes(data, incoming) {
  data.deletedBoxes = data.deletedBoxes || [];
  const changed = mergeTombstones(data.deletedBoxes, incoming, normalizeDeletedBox);
  const deletedIds = new Set((data.deletedBoxes || []).map((item) => item.id));
  const before = data.boxes.length;
  data.boxes = data.boxes.filter((box) => !deletedIds.has(box.id));
  return changed || before !== data.boxes.length;
}

function releaseClientCodes(data, deletedIds) {
  let changed = false;
  data.clientCodes = (data.clientCodes || []).map((item) => {
    if (!deletedIds.has(item.clientId)) return item;
    changed = true;
    return {
      ...item,
      status: "available",
      clientId: "",
      clientName: "",
      assignedAt: "",
      updatedAt: nowIso(),
    };
  });
  return changed;
}

function mergeDeletedClients(data, incoming) {
  data.deletedClients = data.deletedClients || [];
  const changed = mergeTombstones(data.deletedClients, incoming, normalizeDeletedClient);
  const deletedIds = new Set((data.deletedClients || []).map((item) => item.id));
  const before = data.clients.length;
  data.clients = data.clients.filter((client) => !deletedIds.has(client.id));
  const codesChanged = releaseClientCodes(data, deletedIds);
  return changed || codesChanged || before !== data.clients.length;
}

async function pullCloudSnapshot(data) {
  const result = await cloudRequest("/api/admin/snapshot");
  if (!result?.ok) {
    return { changed: false, status: result?.error || "cloud_unknown_error", pulledClients: 0 };
  }
  const snapshot = result?.data || {};
  const clients = Array.isArray(snapshot.clients) ? snapshot.clients : [];
  let changed = false;
  clients.forEach((client) => {
    changed = mergeClient(data, client) || changed;
  });
  changed = mergeById(data.boxes, snapshot.boxes) || changed;
  changed = mergeById(data.shipments, snapshot.shipments) || changed;
  changed = mergeById(data.activity, snapshot.activity) || changed;
  changed = mergeClientCodes(data, snapshot.clientCodes) || changed;
  changed = mergeDeletedBoxes(data, snapshot.deletedBoxes) || changed;
  changed = mergeDeletedClients(data, snapshot.deletedClients) || changed;
  if (snapshot.settings && typeof snapshot.settings === "object") {
    const nextSettings = { ...data.settings, ...snapshot.settings };
    if (JSON.stringify(nextSettings) !== JSON.stringify(data.settings)) {
      data.settings = nextSettings;
      changed = true;
    }
  }
  if (snapshot.finances && typeof snapshot.finances === "object") {
    data.finances = { ...data.finances, ...snapshot.finances };
  }
  return { changed, status: "connected", pulledClients: clients.length };
}

async function pushCloudClient(client, source = "manual") {
  const normalized = normalizeCloudClient({ ...client, registrationSource: source });
  if (!normalized.name) return;
  await cloudRequest("/api/admin/clients/upsert", {
    method: "POST",
    body: JSON.stringify(normalized),
  });
}

async function pushCloudClients(data) {
  if (!Array.isArray(data.clients) || !data.clients.length) return;
  await Promise.all(
    data.clients
      .filter((client) => String(client?.name || "").trim())
      .map((client) => pushCloudClient(client, client.registrationSource || "manual")),
  );
}

async function pushCloudSnapshot(data) {
  await cloudRequest("/api/admin/snapshot/sync", {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

function isPaidPayment(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "оплачено" || normalized === "paid";
}

function numericWeight(value) {
  return toNumber(value);
}

function volumeWeight(dimensions) {
  const parts = String(dimensions || "")
    .split(/[xх*×]/i)
    .map((part) => toNumber(part))
    .filter((part) => part > 0);
  if (parts.length !== 3) return 0;
  return Math.round((parts[0] * parts[1] * parts[2] / 5000) * 10) / 10;
}

function chargeableWeight(weight, dimensions) {
  return Math.max(numericWeight(weight), volumeWeight(dimensions));
}

function emptyStore() {
  return {
    boxes: [],
    clients: [],
    warehouse: [],
    shipments: [],
    finances: {
      incomeToday: 0,
      expectedToday: 0,
      expensesToday: 0,
      debt: 0,
      costToday: 0,
      chargedToday: 0,
      profitToday: 0,
    },
    activity: [],
    clientCodes: [],
    deletedBoxes: [],
    deletedClients: [],
    settings: {
      chinaAddress: DEFAULT_CHINA_ADDRESS,
    },
  };
}

function zoneFromPlace(place) {
  const value = String(place || "").trim();
  if (!value) return "Без места";
  const [first] = value.split(/[\/\s-]+/).filter(Boolean);
  return first || "Без места";
}

function deriveWarehouse(boxes) {
  const activeBoxes = boxes.filter((box) => box.status !== "Выдано");
  const groups = new Map();

  activeBoxes.forEach((box) => {
    const zone = zoneFromPlace(box.place);
    const current = groups.get(zone) || { zone, boxes: 0, note: box.place || "Место не указано" };
    current.boxes += 1;
    if (!current.note && box.place) current.note = box.place;
    groups.set(zone, current);
  });

  return Array.from(groups.values())
    .sort((a, b) => a.zone.localeCompare(b.zone, "ru"))
    .map((item) => ({
      ...item,
      fill: Math.min(100, Math.max(8, item.boxes * 8)),
    }));
}

function ensureStore(app) {
  fs.mkdirSync(dataDir(app), { recursive: true });
  if (!fs.existsSync(storePath(app))) {
    fs.writeFileSync(storePath(app), JSON.stringify(emptyStore(), null, 2), "utf8");
  }
}

function readStore(app) {
  ensureStore(app);
  const raw = fs.readFileSync(storePath(app), "utf8").replace(/^\uFEFF/, "");
  const data = JSON.parse(raw);
  const defaults = emptyStore();
  return {
    ...defaults,
    ...data,
    boxes: Array.isArray(data.boxes) ? data.boxes : [],
    clients: Array.isArray(data.clients) ? data.clients : [],
    warehouse: Array.isArray(data.warehouse) ? data.warehouse : [],
    shipments: Array.isArray(data.shipments) ? data.shipments : [],
    activity: Array.isArray(data.activity) ? data.activity : [],
    clientCodes: Array.isArray(data.clientCodes) ? data.clientCodes.map((item, index) => normalizeClientCodeItem(item, index)).filter((item) => item.code) : [],
    deletedBoxes: Array.isArray(data.deletedBoxes) ? data.deletedBoxes.map(normalizeDeletedBox).filter((item) => item.id) : [],
    deletedClients: Array.isArray(data.deletedClients) ? data.deletedClients.map(normalizeDeletedClient).filter((item) => item.id) : [],
    settings: { ...defaults.settings, ...(data.settings || {}) },
    finances: { ...defaults.finances, ...(data.finances || {}) },
  };
}

function writeStore(app, data) {
  ensureStore(app);
  fs.writeFileSync(storePath(app), JSON.stringify(data, null, 2), "utf8");
}

function withPermission(app, payload, permission, action) {
  const auth = validateSession(app, payload?.sessionToken, permission);
  if (!auth.ok) return auth;
  const input = { ...(payload || {}), user: payload?.user || auth.user?.name || "CFlow" };
  return action(input, auth.user);
}

function logActivity(data, title, text, user, boxId = "") {
  data.activity.unshift({
    id: makeId("ACT", data.activity.length),
    time: nowIso(),
    title,
    text,
    user: user || "CFlow",
    boxId,
  });
  data.activity = data.activity.slice(0, 80);
}

async function publicSnapshot(app) {
  const data = readStore(app);
  let localChanged = mergeDeletedBoxes(data, data.deletedBoxes);
  localChanged = mergeDeletedClients(data, data.deletedClients) || localChanged;
  const sync = await pullCloudSnapshot(data);
  await pushCloudClients(data);
  await pushCloudSnapshot(data);
  if (localChanged || sync.changed) writeStore(app, data);
  const warehouse = deriveWarehouse(data.boxes);
  return {
    ok: true,
    sync,
    data: {
      ...data,
      warehouse,
      activity: data.activity.map(cleanActivityForDisplay),
    },
  };
}

function upsertClient(data, input) {
  const name = cleanName(input.client || input.name);
  const phone = String(input.phone || "").trim();
  if (!name) throw new Error("Укажите имя клиента");

  const existing = data.clients.find((client) =>
    (phone && client.phone === phone) || client.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    existing.name = name || existing.name;
    existing.phone = phone || existing.phone;
    existing.telegram = String(input.telegram || existing.telegram || "").trim();
    existing.telegramId = String(input.telegramId || existing.telegramId || "").trim();
    existing.comments = String(input.comments || input.comment || existing.comments || "").trim();
    existing.clientCode = normalizeGeneratedClientCode(input.clientCode || existing.clientCode || "");
    existing.chinaAddress = String(input.chinaAddress || existing.chinaAddress || "").trim();
    existing.clientRate = toNumber(input.clientRate) || existing.clientRate || 0;
    existing.chinaRate = toNumber(input.chinaRate) || existing.chinaRate || 0;
    existing.registrationSource = String(input.registrationSource || existing.registrationSource || "manual").trim();
    existing.registrationStatus = String(input.registrationStatus || existing.registrationStatus || "approved").trim();
    existing.updatedAt = nowIso();
    return existing;
  }

  const client = {
    id: makeId("CL", data.clients.length),
    name,
    phone,
    telegram: String(input.telegram || "").trim(),
    telegramId: String(input.telegramId || "").trim(),
    comments: String(input.comments || input.comment || "").trim(),
    clientCode: normalizeGeneratedClientCode(input.clientCode || ""),
    chinaAddress: String(input.chinaAddress || "").trim(),
    clientRate: toNumber(input.clientRate),
    chinaRate: toNumber(input.chinaRate),
    registrationSource: String(input.registrationSource || "manual").trim(),
    registrationStatus: String(input.registrationStatus || "approved").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.clients.unshift(client);
  return client;
}

function receiveBox(app, input) {
  const data = readStore(app);
  const track = String(input.track || "").trim();
  const code = String(input.code || "").trim();
  const inputClientCode = normalizeGeneratedClientCode(input.clientCode || "");
  const matchedClient = inputClientCode
    ? data.clients.find((client) => String(client.clientCode || "").toLowerCase() === inputClientCode.toLowerCase())
    : null;
  const clientName = String(input.client || matchedClient?.name || "").trim();
  const phone = String(input.phone || "").trim();
  const weight = String(input.weight || "").trim();
  const dimensions = String(input.dimensions || "").trim();

  if (!track || !weight) {
    return { ok: false, error: "Укажите трек и вес" };
  }

  if (data.boxes.some((box) => box.track.toLowerCase() === track.toLowerCase())) {
    return { ok: false, error: "Коробка с таким треком уже есть" };
  }

  if (code && data.boxes.some((box) => String(box.code || "").toLowerCase() === code.toLowerCase())) {
    return { ok: false, error: "Коробка с таким кодом уже есть" };
  }

  const { clientRate: ignoredClientRate, chinaRate: ignoredChinaRate, ...clientInput } = input;
  const client = clientName ? upsertClient(data, { ...clientInput, client: clientName, phone: phone || matchedClient?.phone || "" }) : null;
  const id = makeId("CF", data.boxes.length);
  const status = client ? "На складе" : "Без клиента";
  const place = String(input.place || "Зона приемки").trim();
  const clientRate = toNumber(input.clientRate);
  const chinaRate = toNumber(input.chinaRate);
  const billableWeight = chargeableWeight(weight, dimensions);
  const costAmount = Math.round(billableWeight * chinaRate);
  const chargeAmount = Math.round(billableWeight * clientRate) || toNumber(input.amount);
  const profitAmount = chargeAmount - costAmount;
  const box = {
    id,
    track,
    code,
    clientCode: client?.clientCode || inputClientCode,
    clientId: client?.id || "",
    client: client?.name || "Без клиента",
    phone: client?.phone || phone,
    telegramId: client?.telegramId || "",
    status,
    place,
    weight: weight.endsWith("кг") ? weight : `${weight} кг`,
    dimensions,
    route: String(input.route || "Китай -> Казахстан").trim(),
    payment: String(input.payment || "Не оплачено").trim(),
    amount: chargeAmount,
    batch: String(input.batch || "").trim(),
    chinaRate,
    clientRate,
    costAmount,
    chargeAmount,
    profitAmount,
    photo: String(input.photo || "").trim(),
    comment: String(input.comment || "").trim(),
    owner: String(input.user || "Оператор").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  data.boxes.unshift(box);
  data.finances.costToday = Number(data.finances.costToday || 0) + costAmount;
  data.finances.expensesToday = Number(data.finances.expensesToday || 0) + costAmount;
  data.finances.chargedToday = Number(data.finances.chargedToday || 0) + chargeAmount;
  data.finances.profitToday = Number(data.finances.profitToday || 0) + profitAmount;
  if (box.amount > 0) {
    if (isPaidPayment(box.payment)) {
      data.finances.incomeToday = Number(data.finances.incomeToday || 0) + box.amount;
    } else {
      data.finances.expectedToday = Number(data.finances.expectedToday || 0) + box.amount;
      data.finances.debt = Number(data.finances.debt || 0) + box.amount;
    }
  }
  logActivity(data, "Приемка", `${box.id} принята и размещена: ${place}`, box.owner, box.id);
  writeStore(app, data);
  return publicSnapshot(app);
}

function updateBox(app, boxId, patch, title, user) {
  const data = readStore(app);
  const index = data.boxes.findIndex((box) => box.id === boxId);
  if (index === -1) return { ok: false, error: "Коробка не найдена" };

  data.boxes[index] = {
    ...data.boxes[index],
    ...patch,
    updatedAt: nowIso(),
  };
  logActivity(data, title, `${boxId}: ${Object.values(patch).filter(Boolean).join(", ")}`, user, boxId);
  writeStore(app, data);
  return publicSnapshot(app);
}

function moveBox(app, input) {
  const boxId = String(input.boxId || "").trim();
  const place = String(input.place || "").trim();
  if (!boxId || !place) return { ok: false, error: "Укажите коробку и новое место" };
  return updateBox(app, boxId, { place, status: "На складе", owner: input.user || "Оператор" }, "Перемещение", input.user);
}

function issueBox(app, input) {
  const boxId = String(input.boxId || "").trim();
  if (!boxId) return { ok: false, error: "Выберите коробку" };
  const data = readStore(app);
  const box = data.boxes.find((item) => item.id === boxId);
  if (!box) return { ok: false, error: "Коробка не найдена" };
  if (box.status === "Выдано") return { ok: false, error: "Эта коробка уже выдана" };
  return updateBox(app, boxId, { status: "Выдано", place: "Выдано клиенту", owner: input.user || "Оператор" }, "Выдача", input.user);
}

function setProblem(app, input) {
  const boxId = String(input.boxId || "").trim();
  const comment = String(input.comment || "Требует проверки").trim();
  if (!boxId) return { ok: false, error: "Выберите коробку" };
  return updateBox(app, boxId, { status: "Проблема", comment, place: "Зона проверки", owner: input.user || "Оператор" }, "Проблема", input.user);
}

function updateStatus(app, input) {
  const boxId = String(input.boxId || "").trim();
  const status = String(input.status || "").trim();
  const allowedStatuses = new Set(["Принято", "На складе", "В отправке", "В пути", "На таможне", "Прибыло", "Ждет выдачи", "Выдано", "Без клиента", "Проблема", "Задержано", "Повреждено", "Возврат", "Потеряно"]);
  if (!boxId) return { ok: false, error: "Выберите коробку" };
  if (!allowedStatuses.has(status)) return { ok: false, error: "Выберите корректный статус" };
  return updateBox(app, boxId, { status, owner: input.user || "Оператор" }, "Статус", input.user);
}

async function createClient(app, input) {
  const data = readStore(app);
  try {
    const client = upsertClient(data, input);
    logActivity(data, "Клиент", `Создан или обновлен клиент ${client.name}`, input.user || "Оператор");
    writeStore(app, data);
    await pushCloudClient(client, client.registrationSource || input.registrationSource || "manual");
    return publicSnapshot(app);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function addClientCodes(app, input) {
  const data = readStore(app);
  const chunks = String(input.codes || input.clientCodes || "")
    .split(/[\r\n,; \t]+/)
    .map(normalizeClientCode)
    .filter(Boolean);
  if (!chunks.length) return { ok: false, error: "Добавьте хотя бы один код клиента" };

  const existingCodes = new Set((data.clientCodes || []).map((item) => String(item.code || "").toLowerCase()));
  const added = [];
  chunks.forEach((code) => {
    const key = code.toLowerCase();
    if (existingCodes.has(key)) return;
    existingCodes.add(key);
    const item = normalizeClientCodeItem({ code }, data.clientCodes.length + added.length);
    data.clientCodes.unshift(item);
    added.push(item);
  });

  if (!added.length) return { ok: false, error: "Все эти коды уже есть в базе" };
  logActivity(data, "Коды клиентов", `Добавлено кодов: ${added.length}`, input.user || "Оператор");
  writeStore(app, data);
  return publicSnapshot(app);
}

async function saveWarehouseAddress(app, input) {
  const data = readStore(app);
  const chinaAddress = String(input.chinaAddress || DEFAULT_CHINA_ADDRESS).trim();
  if (!chinaAddress) return { ok: false, error: "Укажите адрес склада в Китае" };
  data.settings = { ...(data.settings || {}), chinaAddress, updatedAt: nowIso() };
  logActivity(data, "Адрес склада", "Адрес склада в Китае обновлен", input.user || "Оператор");
  writeStore(app, data);
  return publicSnapshot(app);
}

async function issueClientCode(app, input) {
  const data = readStore(app);
  const clientId = String(input.clientId || "").trim();
  if (!clientId) return { ok: false, error: "Выберите клиента" };
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return { ok: false, error: "Клиент не найден" };

  const chinaAddress = String(data.settings?.chinaAddress || DEFAULT_CHINA_ADDRESS).trim();
  if (!chinaAddress) return { ok: false, error: "Сначала сохраните адрес склада в Китае на дашборде" };

  const now = nowIso();
  if (!client.clientCode) {
    const code = generateNextClientCode(data);
    const codeKey = code.toLowerCase();
    const existingCodeItem = (data.clientCodes || []).find((item) => String(item.code || "").toLowerCase() === codeKey);
    const codeItem = existingCodeItem || normalizeClientCodeItem({
      id: `CC-${CLIENT_CODE_CITY_PREFIX}-${String(generatedCodeIndex(code) + 1).padStart(6, "0")}`,
      code,
      status: "assigned",
      clientId: client.id,
      clientName: client.name,
      assignedAt: now,
      createdAt: now,
      updatedAt: now,
    }, data.clientCodes.length);
    codeItem.status = "assigned";
    codeItem.clientId = client.id;
    codeItem.clientName = client.name;
    codeItem.assignedAt = now;
    codeItem.updatedAt = now;
    if (!existingCodeItem) data.clientCodes.unshift(codeItem);
    client.clientCode = code;
  }

  client.chinaAddress = client.chinaAddress || chinaAddress;
  client.registrationStatus = "approved";
  client.updatedAt = now;
  logActivity(data, "Код клиента", `${client.clientCode} закреплен за ${client.name}`, input.user || "Оператор");
  writeStore(app, data);
  await pushCloudClient(client, client.registrationSource || "manual");
  return publicSnapshot(app);
}

function createShipment(app, input) {
  const data = readStore(app);
  const title = String(input.title || "").trim();
  const type = String(input.type || "Контейнер").trim();
  if (!title) return { ok: false, error: "Укажите номер отправки" };

  const selectedBoxes = String(input.boxIds || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!selectedBoxes.length) return { ok: false, error: "Добавьте хотя бы одну коробку в отправку" };

  const existingIds = new Set(data.boxes.map((box) => box.id));
  const missing = selectedBoxes.filter((id) => !existingIds.has(id));
  if (missing.length) return { ok: false, error: `Коробки не найдены: ${missing.join(", ")}` };

  const shipment = {
    id: makeId("SHIP", data.shipments.length),
    type,
    title,
    date: String(input.date || nowIso().slice(0, 10)),
    route: String(input.route || "Казахстан").trim(),
    boxes: selectedBoxes,
    cost: toNumber(input.cost),
  };

  data.shipments.unshift(shipment);
  data.boxes = data.boxes.map((box) =>
    selectedBoxes.includes(box.id) ? { ...box, status: "В отправке", place: `${type} ${title}`, updatedAt: nowIso() } : box,
  );
  selectedBoxes.forEach((boxId) => logActivity(data, "Отправка", `${boxId}: добавлена в ${type} ${title}`, input.user || "Оператор", boxId));
  writeStore(app, data);
  return publicSnapshot(app);
}

function recordPayment(app, input) {
  const data = readStore(app);
  const boxId = String(input.boxId || "").trim();
  const amount = toNumber(input.amount);
  if (!boxId || amount <= 0) return { ok: false, error: "Укажите коробку и сумму" };
  const box = data.boxes.find((item) => item.id === boxId);
  if (!box) return { ok: false, error: "Коробка не найдена" };

  box.payment = "Оплачено";
  box.amount = amount;
  box.updatedAt = nowIso();
  data.finances.incomeToday = Number(data.finances.incomeToday || 0) + amount;
  data.finances.debt = Math.max(0, Number(data.finances.debt || 0) - amount);
  data.finances.expectedToday = Math.max(0, Number(data.finances.expectedToday || 0) - amount);
  logActivity(data, "Оплата", `${boxId}: принято ${amount} T`, input.user || "Оператор", boxId);
  writeStore(app, data);
  return publicSnapshot(app);
}

async function deleteBox(app, input) {
  const data = readStore(app);
  const boxId = String(input.boxId || "").trim();
  const reason = String(input.reason || "").trim();
  if (!boxId) return { ok: false, error: "Выберите коробку" };
  if (!reason) return { ok: false, error: "Укажите причину удаления" };

  const box = data.boxes.find((item) => item.id === boxId);
  if (!box) return { ok: false, error: "Коробка не найдена" };

  data.boxes = data.boxes.filter((item) => item.id !== boxId);
  data.deletedBoxes = data.deletedBoxes || [];
  mergeDeletedBoxes(data, [{ id: boxId, reason, deletedAt: nowIso() }]);
  data.shipments = data.shipments
    .map((shipment) => ({
      ...shipment,
      boxes: Array.isArray(shipment.boxes) ? shipment.boxes.filter((id) => id !== boxId) : [],
    }))
    .filter((shipment) => shipment.boxes.length > 0);
  logActivity(data, "Удаление", `${boxId} удалена из базы. Причина: ${reason}`, input.user || "Оператор", boxId);
  writeStore(app, data);
  await cloudRequest("/api/admin/boxes/delete", {
    method: "POST",
    body: JSON.stringify({ boxId, reason }),
  });
  return publicSnapshot(app);
}

async function deleteClient(app, input) {
  const data = readStore(app);
  const clientId = String(input.clientId || "").trim();
  const reason = String(input.reason || "").trim();
  if (!clientId) return { ok: false, error: "Выберите клиента" };
  if (!reason) return { ok: false, error: "Укажите причину удаления" };

  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return { ok: false, error: "Клиент не найден" };

  const linkedBoxes = data.boxes.filter((box) =>
    box.clientId === client.id ||
    (client.clientCode && box.clientCode === client.clientCode) ||
    (client.phone && box.phone === client.phone) ||
    box.client === client.name,
  );
  if (linkedBoxes.length) {
    return { ok: false, error: `У клиента есть коробки: ${linkedBoxes.length}. Сначала разберите связанные грузы.` };
  }

  data.clients = data.clients.filter((item) => item.id !== clientId);
  data.deletedClients = data.deletedClients || [];
  mergeDeletedClients(data, [{ id: clientId, reason, deletedAt: nowIso() }]);
  logActivity(data, "Удаление клиента", `${client.name} удален из базы. Причина: ${reason}`, input.user || "Оператор");
  writeStore(app, data);
  await cloudRequest("/api/admin/clients/delete", {
    method: "POST",
    body: JSON.stringify({ clientId, reason }),
  });
  return publicSnapshot(app);
}

function registerCflowIpc(ipcMain, app) {
  ipcMain.handle("cflow-data:snapshot", (_event, payload) => withPermission(app, payload, "search", () => publicSnapshot(app)));
  ipcMain.handle("cflow-data:receive-box", (_event, payload) => withPermission(app, payload, "receive_box", (input) => receiveBox(app, input)));
  ipcMain.handle("cflow-data:move-box", (_event, payload) => withPermission(app, payload, "move_box", (input) => moveBox(app, input)));
  ipcMain.handle("cflow-data:issue-box", (_event, payload) => withPermission(app, payload, "issue_box", (input) => issueBox(app, input)));
  ipcMain.handle("cflow-data:update-status", (_event, payload) => withPermission(app, payload, "warehouse", (input) => updateStatus(app, input)));
  ipcMain.handle("cflow-data:problem-box", (_event, payload) => withPermission(app, payload, "warehouse", (input) => setProblem(app, input)));
  ipcMain.handle("cflow-data:create-client", (_event, payload) => withPermission(app, payload, "clients", (input) => createClient(app, input)));
  ipcMain.handle("cflow-data:add-client-codes", (_event, payload) => withPermission(app, payload, "all", (input) => addClientCodes(app, input)));
  ipcMain.handle("cflow-data:save-warehouse-address", (_event, payload) => withPermission(app, payload, "all", (input) => saveWarehouseAddress(app, input)));
  ipcMain.handle("cflow-data:issue-client-code", (_event, payload) => withPermission(app, payload, "clients", (input) => issueClientCode(app, input)));
  ipcMain.handle("cflow-data:create-shipment", (_event, payload) => withPermission(app, payload, "warehouse", (input) => createShipment(app, input)));
  ipcMain.handle("cflow-data:record-payment", (_event, payload) => withPermission(app, payload, "finance", (input) => recordPayment(app, input)));
  ipcMain.handle("cflow-data:delete-box", (_event, payload) => withPermission(app, payload, "all", (input) => deleteBox(app, input)));
  ipcMain.handle("cflow-data:delete-client", (_event, payload) => withPermission(app, payload, "all", (input) => deleteClient(app, input)));
  ipcMain.handle("cflow-data:currency-rates", (_event, payload) => withPermission(app, payload, "search", () => fetchCurrencyRates()));
}

module.exports = {
  registerCflowIpc,
};

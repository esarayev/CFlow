const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

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

function makeId(prefix, count) {
  return `${prefix}-${String(count + 1).padStart(6, "0")}`;
}

function toNumber(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
    apiUrl: String(process.env.CFLOW_CLOUD_API_URL || process.env.CFLOW_API_URL || "https://es-logistics-client.f7zp26dshq.chatgpt.site").replace(/\/+$/, ""),
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

function normalizeCloudClient(client) {
  return {
    id: String(client.id || "").trim(),
    name: String(client.name || client.fullName || "").trim(),
    phone: String(client.phone || "").trim(),
    telegram: String(client.telegram || client.telegramUsername || "").trim(),
    telegramId: String(client.telegramId || "").trim(),
    comments: String(client.comments || client.comment || "").trim(),
    clientCode: String(client.clientCode || client.code || "").trim(),
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

function seedData() {
  const createdAt = nowIso();
  const clients = [
    { id: "CL-000001", name: "Айгерим Сагындык", phone: "+7 701 445 19 20", telegram: "@aigerim", comments: "Постоянный клиент" },
    { id: "CL-000002", name: "Dias Market", phone: "+7 777 808 33 11", telegram: "@dias_market", comments: "Магазин" },
    { id: "CL-000003", name: "Нурбол Канат", phone: "+7 705 221 77 41", telegram: "", comments: "Проверить документы" },
    { id: "CL-000004", name: "Madina Store", phone: "+7 747 129 90 00", telegram: "@madina_store", comments: "" },
  ];

  const boxes = [
    {
      id: "CF-240718",
      track: "YT938475120CN",
      clientId: "CL-000001",
      client: "Айгерим Сагындык",
      phone: "+7 701 445 19 20",
      status: "На складе",
      place: "A-04 / S2 / P3",
      weight: "8.4 кг",
      dimensions: "42x35x28",
      route: "Гуанчжоу -> Алматы",
      payment: "Оплачено",
      amount: 18600,
      photo: "",
      comment: "",
      owner: "Марат",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "CF-240719",
      track: "LP004492018FR",
      clientId: "CL-000002",
      client: "Dias Market",
      phone: "+7 777 808 33 11",
      status: "Ждет выдачи",
      place: "B-01 / S1 / P1",
      weight: "13.7 кг",
      dimensions: "55x38x30",
      route: "Париж -> Астана",
      payment: "Долг 18 600 T",
      amount: 18600,
      photo: "",
      comment: "Выдать после оплаты",
      owner: "Алина",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "CF-240720",
      track: "QR-88-1045",
      clientId: "CL-000003",
      client: "Нурбол Канат",
      phone: "+7 705 221 77 41",
      status: "Проблема",
      place: "Зона проверки",
      weight: "2.1 кг",
      dimensions: "24x18x12",
      route: "Иу -> Алматы",
      payment: "Не оплачено",
      amount: 7200,
      photo: "",
      comment: "Нет клиента в накладной",
      owner: "Сергей",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "CF-240721",
      track: "CNKZ55612008",
      clientId: "CL-000004",
      client: "Madina Store",
      phone: "+7 747 129 90 00",
      status: "В отправке",
      place: "Контейнер KZ-18",
      weight: "21.0 кг",
      dimensions: "60x45x38",
      route: "Шэньчжэнь -> Алматы",
      payment: "Оплачено",
      amount: 29400,
      photo: "",
      comment: "",
      owner: "Марат",
      createdAt,
      updatedAt: createdAt,
    },
  ];

  return {
    boxes,
    clients,
    warehouse: [
      { zone: "A", fill: 78, boxes: 412, note: "Приемка и быстрые выдачи" },
      { zone: "B", fill: 52, boxes: 238, note: "Клиентская зона" },
      { zone: "C", fill: 91, boxes: 501, note: "Крупный груз" },
      { zone: "QC", fill: 34, boxes: 36, note: "Проверка и фото" },
    ],
    shipments: [
      { id: "SHIP-000001", type: "Контейнер", title: "KZ-18", date: createdAt.slice(0, 10), route: "Шэньчжэнь -> Алматы", boxes: ["CF-240721"], cost: 240000 },
    ],
    finances: {
      incomeToday: 2840500,
      expectedToday: 418000,
      expensesToday: 620000,
      debt: 25800,
    },
    activity: [
      { id: "ACT-000001", time: createdAt, title: "Размещение", text: "CF-240718 поставлена в A-04 / S2 / P3", user: "Марат" },
      { id: "ACT-000002", time: createdAt, title: "Выдача", text: "CF-240719 переведена в ожидание клиента", user: "Алина" },
      { id: "ACT-000003", time: createdAt, title: "Клиент", text: "Создан клиент Нурбол Канат", user: "Сергей" },
      { id: "ACT-000004", time: createdAt, title: "Отправка", text: "Контейнер KZ-18 получил 16 коробок", user: "Марат" },
    ],
  };
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
    finances: { ...defaults.finances, ...(data.finances || {}) },
  };
}

function writeStore(app, data) {
  ensureStore(app);
  fs.writeFileSync(storePath(app), JSON.stringify(data, null, 2), "utf8");
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
  const sync = await pullCloudSnapshot(data);
  await pushCloudClients(data);
  await pushCloudSnapshot(data);
  if (sync.changed) writeStore(app, data);
  const warehouse = deriveWarehouse(data.boxes);
  return {
    ok: true,
    sync,
    data: {
      ...data,
      warehouse,
      activity: data.activity.map((item) => ({ ...item, displayTime: displayTime(item.time) })),
    },
  };
}

function upsertClient(data, input) {
  const name = String(input.client || input.name || "").trim();
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
    existing.clientCode = String(input.clientCode || existing.clientCode || "").trim();
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
    clientCode: String(input.clientCode || "").trim(),
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
  const inputClientCode = String(input.clientCode || "").trim();
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
    await pushCloudClient(client, "manual");
    return publicSnapshot(app);
  } catch (error) {
    return { ok: false, error: error.message };
  }
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

function registerCflowIpc(ipcMain, app) {
  ipcMain.handle("cflow-data:snapshot", () => publicSnapshot(app));
  ipcMain.handle("cflow-data:receive-box", (_event, payload) => receiveBox(app, payload || {}));
  ipcMain.handle("cflow-data:move-box", (_event, payload) => moveBox(app, payload || {}));
  ipcMain.handle("cflow-data:issue-box", (_event, payload) => issueBox(app, payload || {}));
  ipcMain.handle("cflow-data:update-status", (_event, payload) => updateStatus(app, payload || {}));
  ipcMain.handle("cflow-data:problem-box", (_event, payload) => setProblem(app, payload || {}));
  ipcMain.handle("cflow-data:create-client", (_event, payload) => createClient(app, payload || {}));
  ipcMain.handle("cflow-data:create-shipment", (_event, payload) => createShipment(app, payload || {}));
  ipcMain.handle("cflow-data:record-payment", (_event, payload) => recordPayment(app, payload || {}));
  ipcMain.handle("cflow-data:delete-box", (_event, payload) => deleteBox(app, payload || {}));
}

module.exports = {
  registerCflowIpc,
};

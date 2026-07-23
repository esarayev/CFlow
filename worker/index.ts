/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  CFLOW_TELEGRAM_BOT_TOKEN?: string;
  CFLOW_ADMIN_TOKEN?: string;
  CFLOW_TELEGRAM_WEBAPP_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type TelegramClient = {
  telegram_id: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  city: string;
  comment: string;
  status: "pending" | "approved" | "rejected";
  client_code: string;
  china_address: string;
  tariff: string;
  created_at: string;
  updated_at: string;
};

const memoryClients = new Map<string, TelegramClient>();

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

async function sha256Hmac(key: ArrayBuffer, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyTelegramInitData(initData: string, botToken?: string) {
  if (!initData) return { ok: false as const, error: "Нет данных Telegram" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  params.delete("hash");

  if (!hash) return { ok: false as const, error: "Нет подписи Telegram" };
  if (!botToken) return { ok: true as const, unsafeDevMode: true, user: parseTelegramUser(params) };

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(botToken));
  const actual = hex(await sha256Hmac(secret, dataCheckString));
  if (actual !== hash) return { ok: false as const, error: "Неверная подпись Telegram" };

  return { ok: true as const, user: parseTelegramUser(params) };
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

async function ensureTelegramTables(db?: D1Database) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS telegram_clients (
      telegram_id TEXT PRIMARY KEY,
      username TEXT DEFAULT '',
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      full_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      city TEXT DEFAULT '',
      comment TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      client_code TEXT DEFAULT '',
      china_address TEXT DEFAULT '',
      tariff TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS telegram_boxes (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      track TEXT NOT NULL,
      weight TEXT DEFAULT '',
      amount TEXT DEFAULT '',
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

function publicClient(client: TelegramClient | null, boxes: unknown[] = []) {
  return {
    registered: Boolean(client),
    approved: client?.status === "approved",
    client: client
      ? {
          name: client.full_name,
          phone: client.phone,
          city: client.city,
          status: client.status,
          code: client.client_code,
          chinaAddress: client.china_address,
          tariff: client.tariff,
        }
      : null,
    boxes,
  };
}

async function getClient(env: Env, telegramId: string) {
  await ensureTelegramTables(env.DB);
  if (!env.DB) return memoryClients.get(telegramId) || null;
  return await env.DB.prepare("SELECT * FROM telegram_clients WHERE telegram_id = ?").bind(telegramId).first<TelegramClient>();
}

async function upsertClient(env: Env, client: TelegramClient) {
  await ensureTelegramTables(env.DB);
  memoryClients.set(client.telegram_id, client);
  if (!env.DB) return;
  await env.DB.prepare(`
    INSERT INTO telegram_clients (
      telegram_id, username, first_name, last_name, full_name, phone, city, comment, status,
      client_code, china_address, tariff, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      full_name = excluded.full_name,
      phone = excluded.phone,
      city = excluded.city,
      comment = excluded.comment,
      updated_at = excluded.updated_at
  `).bind(
    client.telegram_id,
    client.username,
    client.first_name,
    client.last_name,
    client.full_name,
    client.phone,
    client.city,
    client.comment,
    client.status,
    client.client_code,
    client.china_address,
    client.tariff,
    client.created_at,
    client.updated_at,
  ).run();
}

async function getBoxes(env: Env, telegramId: string) {
  await ensureTelegramTables(env.DB);
  if (!env.DB) {
    return [
      { id: "CF-000001", track: "YT938475120CN", weight: "3.2 кг", status: "В Астане на карго", stage: "astana", amount: "8 000 ₸" },
    ];
  }
  const result = await env.DB.prepare("SELECT id, track, weight, amount, status, stage, updated_at FROM telegram_boxes WHERE telegram_id = ? ORDER BY updated_at DESC").bind(telegramId).all();
  return result.results || [];
}

async function handleClientMe(request: Request, env: Env) {
  const initData = new URL(request.url).searchParams.get("initData") || "";
  const verified = await verifyTelegramInitData(initData, env.CFLOW_TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  if (!verified.user?.id) return json({ ok: false, error: "Telegram пользователь не найден" }, { status: 401 });

  const telegramId = String(verified.user.id);
  const client = await getClient(env, telegramId);
  const boxes = client ? await getBoxes(env, telegramId) : [];
  return json({ ok: true, ...publicClient(client, boxes) });
}

async function handleClientRegister(request: Request, env: Env) {
  const body = await request.json() as { initData?: string; name?: string; phone?: string; city?: string; comment?: string };
  const verified = await verifyTelegramInitData(body.initData || "", env.CFLOW_TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });
  if (!verified.user?.id) return json({ ok: false, error: "Telegram пользователь не найден" }, { status: 401 });

  const now = new Date().toISOString();
  const telegramId = String(verified.user.id);
  const existing = await getClient(env, telegramId);
  const client: TelegramClient = {
    telegram_id: telegramId,
    username: verified.user.username || "",
    first_name: verified.user.first_name || "",
    last_name: verified.user.last_name || "",
    full_name: String(body.name || [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || verified.user.username || "Клиент").trim(),
    phone: String(body.phone || "").trim(),
    city: String(body.city || "").trim(),
    comment: String(body.comment || "").trim(),
    status: existing?.status || "pending",
    client_code: existing?.client_code || "",
    china_address: existing?.china_address || "",
    tariff: existing?.tariff || "",
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  await upsertClient(env, client);
  return json({ ok: true, ...publicClient(client, await getBoxes(env, telegramId)) });
}

async function handleAdminApprove(request: Request, env: Env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.CFLOW_ADMIN_TOKEN || auth !== `Bearer ${env.CFLOW_ADMIN_TOKEN}`) {
    return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  }
  const body = await request.json() as { telegramId?: string; clientCode?: string; chinaAddress?: string; tariff?: string };
  const telegramId = String(body.telegramId || "").trim();
  if (!telegramId) return json({ ok: false, error: "telegramId обязателен" }, { status: 400 });
  const existing = await getClient(env, telegramId);
  if (!existing) return json({ ok: false, error: "Клиент не найден" }, { status: 404 });
  const next: TelegramClient = {
    ...existing,
    status: "approved",
    client_code: String(body.clientCode || "").trim(),
    china_address: String(body.chinaAddress || "").trim(),
    tariff: String(body.tariff || "").trim(),
    updated_at: new Date().toISOString(),
  };
  await upsertClient(env, next);
  return json({ ok: true, ...publicClient(next, await getBoxes(env, telegramId)) });
}

async function handleTelegramConfigure(request: Request, env: Env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.CFLOW_ADMIN_TOKEN || auth !== `Bearer ${env.CFLOW_ADMIN_TOKEN}`) {
    return json({ ok: false, error: "Нет доступа" }, { status: 403 });
  }
  if (!env.CFLOW_TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Нет токена Telegram бота" }, { status: 500 });
  const webAppUrl = env.CFLOW_TELEGRAM_WEBAPP_URL || `${new URL(request.url).origin}/client`;
  const response = await fetch(`https://api.telegram.org/bot${env.CFLOW_TELEGRAM_BOT_TOKEN}/setChatMenuButton`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      menu_button: {
        type: "web_app",
        text: "Кабинет ES Logistics",
        web_app: { url: webAppUrl },
      },
    }),
  });
  const data = await response.json();
  return json({ ok: response.ok, telegram: data, webAppUrl }, { status: response.ok ? 200 : 502 });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/client/me" && request.method === "GET") {
      return handleClientMe(request, env);
    }

    if (url.pathname === "/api/client/register" && request.method === "POST") {
      return handleClientRegister(request, env);
    }

    if (url.pathname === "/api/admin/telegram-clients/approve" && request.method === "POST") {
      return handleAdminApprove(request, env);
    }

    if (url.pathname === "/api/telegram/configure" && request.method === "POST") {
      return handleTelegramConfigure(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

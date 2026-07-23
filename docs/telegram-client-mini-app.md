# CFlow Telegram Client Mini App

## Goal

The Telegram client app is a mobile-first customer cabinet for ES Logistics clients.

The first version must keep the flow simple:

1. Client opens `t.me/es_logistics_bot`.
2. Client registers through Telegram.
3. Manager confirms the client in the admin/desktop side.
4. Client receives a client code and China warehouse address.
5. Client tracks cargo stages:
   - On warehouse in China
   - In transit
   - In Kazakhstan
   - In Astana cargo point

## Current implementation

The client-facing screen is implemented at:

```text
/client
```

It currently includes a working Mini App frontend and Worker API contract:

- registration form;
- pending approval state;
- approved state from the backend;
- client code and China warehouse address card;
- copy code/address action;
- cargo status timeline;
- Telegram WebApp initialization.
- Telegram `initData` verification on the Worker;
- registration API;
- admin approval API;
- bot menu configuration API.

No bot token is committed to the repository.

## Security

Never place the Telegram bot token in:

- React components;
- desktop Electron bundle;
- public frontend environment variables;
- Git commits;
- screenshots or support chats.

Use only server-side environment variables:

```text
CFLOW_TELEGRAM_BOT_TOKEN=
CFLOW_TELEGRAM_BOT_USERNAME=es_logistics_bot
CFLOW_TELEGRAM_WEBAPP_URL=https://app.cflow.kz/client
CFLOW_ADMIN_TOKEN=
```

The token must be stored only in Sites/Cloudflare runtime secrets or an ignored local `.env.local`.

## Backend needed next

The current Worker endpoints are:

```text
GET  /api/client/me?initData=...
POST /api/client/register
POST /api/admin/telegram-clients/approve
POST /api/telegram/configure
```

Admin endpoints require:

```text
Authorization: Bearer <CFLOW_ADMIN_TOKEN>
```

Production persistence requires a D1 binding. Without D1, the Worker can only use a volatile development fallback.

Approval payload:

```json
{
  "telegramId": "123456789",
  "clientCode": "CN-777",
  "chinaAddress": "Guangzhou warehouse address",
  "tariff": "2500 KZT / kg"
}
```

## Bot commands

Recommended first bot commands:

```text
/start - open client cabinet
/help - show how to get client code and warehouse address
/status - open cargo status
```

## BotFather setup

Set the Mini App URL to:

```text
https://app.cflow.kz/client
```

The final production URL must use HTTPS.

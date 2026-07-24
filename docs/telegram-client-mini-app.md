# CFlow Telegram Mini Apps

## Current Runtime

The client cabinet and manager cabinet are served by one Cloudflare Worker:

```text
https://cflow-miniapp.yegor-sarayev.workers.dev
```

The shared source of truth is Cloudflare D1 (`cflow-production`). The desktop app syncs through the admin API on the same Worker.

## Apps

- Client Mini App: `/`
- Manager Mini App: `/manage`
- Desktop sync API: `/api/admin/*`
- Client API: `/api/client/*`
- Manager API: `/api/manage/*`

## Client Flow

1. Client opens the Telegram bot.
2. Client registers with full name and WhatsApp phone.
3. The registration is stored in the shared `clients` table with `registrationSource = telegram`.
4. Manager issues a client code from the shared code pool.
5. The code is permanently attached to the client and is not offered again.
6. Client sees only the client code, China warehouse address, public cargo statuses, client price, and amount due.

The China warehouse cost/rate is internal and must not be returned to the client Mini App.

## Manager Flow

The manager Mini App is restricted by Telegram username through:

```text
CFLOW_MANAGE_ALLOWED_TELEGRAM_USERNAMES=esaraev85
```

It can list shared clients and issue client codes. Additional manager accounts should be added deliberately, not through the public client app.

## Required Secrets

Store these only as Cloudflare/Windows secrets, never in Git:

```text
CFLOW_TELEGRAM_BOT_TOKEN=
CFLOW_MANAGE_TELEGRAM_BOT_TOKEN=
CFLOW_ADMIN_TOKEN=
```

The Windows desktop app must have the same `CFLOW_ADMIN_TOKEN` as the Worker secret to sync with D1.

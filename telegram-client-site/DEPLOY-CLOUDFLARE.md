# CFlow Cloudflare Deploy

## What stays out of git

- `.cloudflare/deploy.json`
- `.env*`
- Telegram bot tokens
- `CFLOW_ADMIN_TOKEN`

## Required Cloudflare variables/secrets

- `CFLOW_TELEGRAM_BOT_TOKEN`
- `CFLOW_MANAGE_TELEGRAM_BOT_TOKEN`
- `CFLOW_MANAGE_ALLOWED_TELEGRAM_USERNAMES`
- `CFLOW_ADMIN_TOKEN`
- `CFLOW_TELEGRAM_WEBAPP_URL`

## Setup

1. Log in:

```powershell
npx wrangler login
```

2. Create D1:

```powershell
npx wrangler d1 create cflow-production
```

3. Copy `.cloudflare/deploy.example.json` to `.cloudflare/deploy.json` and paste `database_id`.

4. Build and deploy:

```powershell
npm run build:cf
npm run deploy:cf
```

5. Set Telegram menu buttons and the client bot webhook through the deployed URL:

```powershell
Invoke-WebRequest -Method POST -Uri "https://YOUR-WORKER.workers.dev/api/telegram/configure" -Headers @{ Authorization = "Bearer $env:CFLOW_ADMIN_TOKEN" }
```

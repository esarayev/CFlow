# CFlow

CFlow is a cargo point operating system prototype for receiving, storing, sorting, shipping, issuing, searching, and financially tracking every box.

The product direction is security-first:

- Windows desktop app for operators and managers.
- Cloud API as the only gateway to data.
- Cloud Postgres database behind the API.
- No database credentials inside the desktop app.
- MFA, roles, immutable audit history, and server-side finance logic before production use.

## Run web UI locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Run Windows desktop shell

Start the local UI first:

```bash
npm run dev
```

Then run Electron:

```bash
npm run desktop
```

For a deployed protected app, point the desktop shell to the production cloud UI:

```bash
set CFLOW_APP_URL=https://app.cflow.kz
npm run desktop
```

## Validate

```bash
npm run build:web
npm run build
npx electron --version
```

## Security notes

Read [SECURITY.md](./SECURITY.md) and [docs/desktop-cloud-architecture.md](./docs/desktop-cloud-architecture.md) before wiring real customer or financial data.

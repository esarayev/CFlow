# CFlow security baseline

CFlow handles money, client data, shipment locations, phone numbers, and audit history. Treat it as a financial operations system, not as a public brochure site.

## Required production rules

- The Windows desktop app must never contain a direct database password, service-role key, or admin API token.
- Desktop clients call only the cloud API over HTTPS.
- The cloud API owns all database credentials and enforces role-based access control.
- MFA is required for administrator, manager, and finance roles.
- Every mutation writes an immutable audit event with user, device, IP, timestamp, object id, old value, and new value.
- Records are not hard-deleted. Use status changes, archive flags, and reversal transactions.
- Finance operations must be server-side only. The client can request an action, but the server calculates balances and writes ledger entries.
- User sessions should be short-lived access tokens plus refresh token rotation.
- Backups, point-in-time recovery, and export logs are mandatory before real money data is stored.

## Recommended stack

- Desktop: Electron hardened shell for Windows.
- Cloud API: Next.js/Vinext API or a dedicated Node service.
- Database: managed Postgres through Supabase, Neon, RDS, or another hosted Postgres provider.
- File storage: cloud object storage for box photos, with signed upload/download URLs.
- Auth: Supabase Auth, Clerk, Auth0, or a custom OIDC provider with MFA.

## Electron hardening already applied

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- external navigation is blocked unless the origin is explicitly allowlisted
- runtime permissions are denied by default
- certificate errors are rejected
- devtools are disabled in production mode

## Still needed before production

- Real identity provider with MFA.
- Role and permission matrix.
- Cloud API endpoints for boxes, clients, storage, shipments, finance, and audit.
- Server-side validation with rate limiting.
- Cloud database migrations.
- Signed photo uploads.
- Windows code signing certificate.
- Auto-update channel with signed releases.

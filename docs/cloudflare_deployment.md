# Cloudflare Deployment

Phase 7B is Cloudflare mock/demo deployment setup only. It prepares Wrangler, D1, safe defaults, and smoke checks. It does not enable real provider searches.

Phase 7C adds a remote mock/demo baseline seed for D1. Use it when the deployed dashboard works but `/api/deals` shows only `no_deal` because the remote database has no historical fare snapshots yet.

Phase 7D adds remote mock/demo cleanup and reset tooling. Use it when repeated mock scans leave older `no_deal` records visible and you want a clean demo run without touching future real-provider rows.

Phase 7E adds a read-only deployed health snapshot report for portfolio evidence and release notes. It queries public endpoints only and does not require admin or provider credentials.

## Worker Shape

- Worker entrypoint: `src/index.ts`
- HTTP handler: exported `fetch()`
- Cron handler: exported `scheduled()`
- D1 binding name: `DB`
- Default deployed demo provider: `mock`

The deployed Worker requires a D1 binding. Real provider credentials are not required for the first mock/demo deployment.

## 1. Install And Login

From Windows PowerShell:

```powershell
cd "C:\Users\Admin\OneDrive\Documents\flight API real time"
npm install
npm run check
npx wrangler --version
npx wrangler login
```

`npx wrangler` is used so Wrangler does not need to be installed globally.

## 2. Validate Local Deployment Defaults

Run the local config guard:

```powershell
npm run cf:check
```

This checks that `wrangler.toml.example` has the Worker entrypoint, D1 placeholder, cron example, and safe real-provider defaults, and that no secret variable names or token-looking values are present.

## 3. Create D1

Create the D1 database:

```powershell
npm run cf:d1:create:note
npx wrangler d1 create malaysia-flight-deal-radar
```

Copy the returned database UUID. If you want a separate preview database, create another D1 database and keep its UUID for `preview_database_id`.

## 4. Create Local Wrangler Config

Copy the example config:

```powershell
Copy-Item "wrangler.toml.example" "wrangler.toml"
```

Open `wrangler.toml` locally and paste the real D1 UUIDs:

```toml
[[d1_databases]]
binding = "DB"
database_name = "malaysia-flight-deal-radar"
database_id = "<your-d1-database-id>"
preview_database_id = "<your-preview-d1-database-id>"
```

Keep `wrangler.toml.example` generic. If the project owner treats account IDs as private, do not commit `wrangler.toml`.

## 5. Confirm Safe Production Defaults

The first deployment should keep these values:

```toml
ENABLE_REAL_PROVIDERS = "false"
REAL_PROVIDER_DRY_RUN = "true"
DEFAULT_REAL_PROVIDER = ""
MAX_REAL_PROVIDER_SEARCHES_PER_RUN = "1"
MAX_REAL_PROVIDER_DAILY_BUDGET = "1"
TELEGRAM_DRY_RUN = "true"
```

Do not set `DUFFEL_ACCESS_TOKEN` in Cloudflare for the first mock/demo deployment. Amadeus stays optional/fallback and disabled without credentials. Skyscanner remains deferred.

## 6. Apply D1 Migrations

Apply local migrations for Wrangler dev:

```powershell
npm run cf:d1:migrate:local
```

Apply remote migrations:

```powershell
npm run cf:d1:migrate:remote
```

Equivalent explicit commands:

```powershell
npx wrangler d1 migrations apply malaysia-flight-deal-radar --local
npx wrangler d1 migrations apply malaysia-flight-deal-radar --remote
```

The migrations include the initial airport and route seed data.

## 7. Verify D1

Local tables:

```powershell
npx wrangler d1 execute malaysia-flight-deal-radar --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Remote tables:

```powershell
npx wrangler d1 execute malaysia-flight-deal-radar --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Remote seeded airports:

```powershell
npx wrangler d1 execute malaysia-flight-deal-radar --remote --command "SELECT iata_code, airport_name, city FROM airports ORDER BY iata_code LIMIT 10;"
```

## 8. Seed Remote Demo Baselines

The first deployed scan can show only `no_deal` because deal scoring requires at least 20 historical samples for ordinary non-watchlist route scoring. Local demo data already has those samples in `demo-data/`; remote D1 does not until you seed it.

Seed deterministic mock-only baselines locally or remotely:

```powershell
npm run cf:demo:seed:local
npm run cf:demo:seed:remote
```

Verify the remote seed:

```powershell
npm run cf:demo:verify:remote
```

The seed creates:

- 20 historical mock fare snapshots each for `SZB-NRT`, `KUL-BKK`, `KUL-TPE`, `JHB-BKK`, and `KUL-SIN`
- deterministic watchlist rows for those routes so the next admin scan includes them early
- a safe `mock` provider limit reset so the next mock scan is not blocked by previous demo usage

The seed is idempotent. It deletes only rows tagged with `remote-demo-baseline-%` and `remote-demo-watchlist-%`, and it only updates the `mock` provider limit. It does not store raw provider payloads, secrets, passenger identity, passport data, orders, payments, or tickets.

## 9. Local Wrangler Smoke

Start Wrangler dev:

```powershell
npm run cf:dev
```

In another PowerShell window:

```powershell
$base = "http://localhost:8787"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/provider-health"
Invoke-RestMethod "$base/api/deals"
Start-Process "$base/dashboard"
Invoke-RestMethod "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

Expected provider health:

- `mock` is enabled and healthy/available for demo.
- `amadeus` is disabled when credentials are missing.
- `duffel` is disabled because credentials are missing, real providers are disabled, or dry-run is enabled.
- No token or credential value appears in the response.

## 10. Deploy

Run a dry deploy first:

```powershell
npm run cf:deploy:dry
```

Deploy:

```powershell
npm run cf:deploy
```

Smoke the deployed Worker:

```powershell
$base = "https://<your-worker>.<your-subdomain>.workers.dev"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/provider-health"
Invoke-RestMethod "$base/api/deals"
Start-Process "$base/dashboard"
```

Verify `/api/provider-health` shows real providers disabled and does not expose tokens.

## Remote Admin Scan After Demo Seed

After remote migrations and `npm run cf:demo:seed:remote`, trigger one protected mock scan:

```powershell
$base = "https://<your-worker>.<your-subdomain>.workers.dev"
$adminToken = Read-Host "ADMIN_TOKEN"
Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer $adminToken" }
```

Then verify:

```powershell
Invoke-RestMethod "$base/api/deals"
Start-Process "$base/dashboard"
```

Expected remote demo labels after the scan:

- `SZB-NRT`: `strong_deal`
- `KUL-BKK`: `strong_deal`
- `KUL-TPE`: `suspected_deal`
- `JHB-BKK`: `suspected_deal`
- `KUL-SIN`: `no_deal`

If older no-baseline scan results are still visible, the new `strong_deal` and `suspected_deal` records should sort above them by score.

## Remote Demo Cleanup And Reset

Repeated remote mock scans can leave older `no_deal` records in `fare_checks`, `fare_snapshots`, and `deal_scores`. This is expected because the dashboard shows normalized historical scan results, not only the latest run.

To clean only mock/demo rows:

```powershell
npm run cf:demo:cleanup:remote
```

Cleanup scope:

- deletes `alerts`, `deal_scores`, `fare_checks`, `fare_snapshots`, and `search_jobs` only where the provider is `mock`
- deletes only watchlist rows with IDs matching `remote-demo-watchlist-%`
- resets only the `mock` provider usage/health fields
- does not delete airports, route candidates, settings, real provider rows, non-mock provider rows, or user-created watchlist rows

To reset the remote demo baselines:

```powershell
npm run cf:demo:reset:remote
```

The reset helper runs cleanup, seeds mock historical baselines, runs verification, and then prints the exact admin scan command. It does not request, store, or print `ADMIN_TOKEN`.

Manual reset flow:

```powershell
npm run cf:demo:cleanup:remote
npm run cf:demo:seed:remote
npm run cf:demo:verify:remote
$base = "https://<your-worker>.<your-subdomain>.workers.dev"
$adminToken = Read-Host "ADMIN_TOKEN"
Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer $adminToken" }
Invoke-RestMethod "$base/api/deals"
Start-Process "$base/dashboard"
```

Expected label counts after reset and one admin scan:

- `strong_deal`: 2
- `suspected_deal`: 2
- `no_deal`: at least 1

Keep real providers disabled:

```text
ENABLE_REAL_PROVIDERS=false
REAL_PROVIDER_DRY_RUN=true
DEFAULT_REAL_PROVIDER=
```

## Deployment Health Snapshot Report

Generate a sanitized Markdown report from the deployed Worker:

```powershell
npm run cf:demo:report:remote -- --base-url "https://<your-worker>.<your-subdomain>.workers.dev"
```

Write the report to a local file:

```powershell
npm run cf:demo:report:remote -- --base-url "https://<your-worker>.<your-subdomain>.workers.dev" --output "reports/deployment-health-snapshot.md"
```

The script queries:

- `/health`
- `/api/provider-health`
- `/api/deals`
- `/api/deals?deal_label=strong_deal`
- `/api/deals?deal_label=suspected_deal`

The output includes health status, provider readiness, deal-label counts, top strong deals, top suspected deals, generated timestamp, and whether real providers are disabled. It does not need `ADMIN_TOKEN` and must not print provider credentials, Telegram tokens, raw provider payloads, bookings, orders, payments, tickets, or passenger identity data.

Use the report as portfolio evidence for the deployed mock/demo state. Keep real providers disabled until partner access, retention terms, rate limits, and display rules are approved.

## Secrets

Never commit `.dev.vars`, `.env`, real tokens, or provider credentials. Do not store secrets in `wrangler.toml`.

Use Cloudflare secrets only when a feature actually needs them:

```powershell
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

For this first mock/demo deployment, do not set:

```powershell
npx wrangler secret put DUFFEL_ACCESS_TOKEN
```

Future real-provider secrets remain server-side only:

```powershell
npx wrangler secret put AMADEUS_CLIENT_ID
npx wrangler secret put AMADEUS_CLIENT_SECRET
npx wrangler secret put SKYSCANNER_API_KEY
```

## Admin Scan Safety

With no `ADMIN_TOKEN` secret, admin scan is disabled:

```powershell
Invoke-RestMethod -Method Post "$base/api/admin/scan"
```

After setting `ADMIN_TOKEN`, a wrong token should return unauthorized:

```powershell
Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer wrong-token" }
```

Use the real token only from your shell or secret store:

```powershell
$adminToken = Read-Host "ADMIN_TOKEN"
Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer $adminToken" }
```

## Cron

`wrangler.toml.example` includes:

```toml
[triggers]
crons = ["0 */6 * * *"]
```

Cloudflare cron triggers run in UTC. To disable scheduled scans, deploy with:

```toml
[triggers]
crons = []
```

The scheduler still respects provider readiness, disabled states, dry-run mode, and provider budgets.

## Rollback

Fast provider-safety rollback:

- set `ENABLE_REAL_PROVIDERS=false`
- set `REAL_PROVIDER_DRY_RUN=true`
- clear `DEFAULT_REAL_PROVIDER`
- set `TELEGRAM_DRY_RUN=true`
- deploy the updated config

To stop scheduled scans, deploy with `crons = []`. If a secret is suspected to be exposed, rotate it at the provider and replace or delete the Cloudflare secret.

See `docs/deployment_smoke_checklist.md` for the deployment verification checklist.

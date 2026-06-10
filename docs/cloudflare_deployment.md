# Cloudflare Deployment

Phase 7B is Cloudflare mock/demo deployment setup only. It prepares Wrangler, D1, safe defaults, and smoke checks. It does not enable real provider searches.

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

## 8. Local Wrangler Smoke

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

## 9. Deploy

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


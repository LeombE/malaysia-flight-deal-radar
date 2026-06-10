# Cloudflare Deployment

Phase 7A is deployment readiness only. It is safe to deploy the mock/demo Worker and D1 schema, but real providers remain disabled by default.

## Worker Shape

- Worker entrypoint: `src/index.ts`
- HTTP handler: exported `fetch()`
- Cron handler: exported `scheduled()`
- D1 binding name: `DB`
- Local demo provider: `mock`

The Worker requires a D1 binding for deployed Cloudflare routes. Local demo scripts can still run without real provider credentials.

## Prepare Wrangler

Copy the example config and keep account-specific IDs out of Git:

```powershell
Copy-Item "wrangler.toml.example" "wrangler.toml"
```

`wrangler.toml.example` contains only non-secret safety defaults. Replace the D1 placeholder IDs in your local `wrangler.toml` after creating databases.

## Create D1

Create the remote database:

```powershell
npx wrangler d1 create malaysia-flight-deal-radar
```

Paste the returned `database_id` into `wrangler.toml`. If you want a separate preview database, create a second D1 database and paste that UUID into `preview_database_id`.

## Apply Migrations

Apply migrations locally for `wrangler dev`:

```powershell
npx wrangler d1 migrations apply malaysia-flight-deal-radar --local
```

Apply migrations to the remote database:

```powershell
npx wrangler d1 migrations apply malaysia-flight-deal-radar --remote
```

If you configured a preview database:

```powershell
npx wrangler d1 migrations apply malaysia-flight-deal-radar --preview
```

The migrations include the initial airport and route seed data. The JSON demo flow remains available for local browser checks:

```powershell
npm run seed
npm run demo:scan
npm run dev
```

## Verify D1 Tables

Local:

```powershell
npx wrangler d1 execute malaysia-flight-deal-radar --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Remote:

```powershell
npx wrangler d1 execute malaysia-flight-deal-radar --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Verify seeded airports:

```powershell
npx wrangler d1 execute malaysia-flight-deal-radar --remote --command "SELECT iata_code, airport_name, city FROM airports ORDER BY iata_code LIMIT 10;"
```

## Secrets

Do not store secrets in `wrangler.toml`. Use Cloudflare secrets for deployed environments:

```powershell
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put DUFFEL_ACCESS_TOKEN
npx wrangler secret put AMADEUS_CLIENT_ID
npx wrangler secret put AMADEUS_CLIENT_SECRET
```

Future:

```powershell
npx wrangler secret put SKYSCANNER_API_KEY
```

Local-only secrets belong in `.dev.vars`, which is ignored by Git. Keep `.dev.vars.example` as placeholders only.

## Production Safety Defaults

Keep these non-secret vars in `wrangler.toml` until provider access, terms, and quotas are approved:

```toml
ENABLE_REAL_PROVIDERS = "false"
REAL_PROVIDER_DRY_RUN = "true"
DEFAULT_REAL_PROVIDER = ""
MAX_REAL_PROVIDER_SEARCHES_PER_RUN = "1"
MAX_REAL_PROVIDER_DAILY_BUDGET = "1"
TELEGRAM_DRY_RUN = "true"
```

With these values, MockProvider can serve demo data, Amadeus and Duffel are disabled safely unless deliberately configured, and no real provider search should run.

## Cron

`wrangler.toml.example` includes:

```toml
[triggers]
crons = ["0 */6 * * *"]
```

Cloudflare cron triggers run in UTC. To disable scheduled scans, set:

```toml
[triggers]
crons = []
```

Then redeploy. The scheduler still respects provider readiness, disabled states, dry-run mode, and provider budgets.

## Local And Preview Smoke

Run the local verification bundle:

```powershell
npm run check
```

Start local Worker-style development:

```powershell
npx wrangler dev
```

Smoke the local endpoints:

```powershell
$base = "http://localhost:8787"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/provider-health"
Invoke-RestMethod "$base/api/deals"
Start-Process "$base/dashboard"
```

Test the cron handler locally:

```powershell
Invoke-RestMethod "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

Optional dry-run deploy check:

```powershell
npx wrangler deploy --dry-run
```

Deploy only after migrations, vars, and secrets are checked:

```powershell
npx wrangler deploy
```

Smoke the deployed Worker:

```powershell
$base = "https://<your-worker>.<your-subdomain>.workers.dev"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/provider-health"
Invoke-RestMethod "$base/api/deals"
Start-Process "$base/dashboard"
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

Do not paste real tokens into committed files, docs, screenshots, or logs.

## Rollback And Disable Switches

Fast safety rollback:

- set `ENABLE_REAL_PROVIDERS=false`
- set `REAL_PROVIDER_DRY_RUN=true`
- clear `DEFAULT_REAL_PROVIDER`
- set `TELEGRAM_DRY_RUN=true`
- deploy the updated config

To stop cron scans, deploy with `crons = []`. To remove a leaked or obsolete secret, rotate it at the provider and delete or replace the Cloudflare secret.

## Deployment Checklist

- `npm run check` passes.
- `wrangler.toml` uses binding `DB` and real D1 database IDs.
- Local and remote migrations are applied.
- `/health` returns `ok`.
- `/api/provider-health` does not expose secrets.
- `/api/deals` returns JSON without raw provider payloads.
- Dashboard renders and labels stale/expired fares clearly.
- Admin scan is disabled without `ADMIN_TOKEN` and protected with it.
- Real providers are disabled and dry-run protected.
- Skyscanner remains deferred until partner API access, display terms, retention terms, and rate limits are confirmed.


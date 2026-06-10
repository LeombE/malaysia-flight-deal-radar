# Deployment Readiness

Phase 7A prepares the repository for Cloudflare Worker and D1 deployment smoke checks. It is not a real-provider launch phase.

Phase 6A added real-provider readiness guardrails. Phase 6B added a guarded Duffel adapter, and Phase 6C/6D added optional Duffel sandbox smoke tooling. Real providers are still off by default and dry-run protected.

For the full Cloudflare command guide, see `docs/cloudflare_deployment.md`.

## Current Runtime Surfaces

- Worker entrypoint: `src/index.ts`
- Local demo server: `npm run dev`
- Deterministic seed: `npm run seed`
- Deterministic MockProvider scan: `npm run demo:scan`
- Provider readiness CLI: `npm run provider:check`
- Optional Duffel sandbox smoke: `npm run duffel:smoke`
- Verification bundle: `npm run check`
- Cloudflare config check: `npm run cf:check`
- Wrangler dev: `npm run cf:dev`
- D1 local migrations: `npm run cf:d1:migrate:local`
- D1 remote migrations: `npm run cf:d1:migrate:remote`
- Dry deploy: `npm run cf:deploy:dry`
- Deploy: `npm run cf:deploy`

## Cloudflare Setup Summary

Copy the example config, create D1, paste returned IDs into local `wrangler.toml`, then apply migrations:

```powershell
npm run cf:check
Copy-Item "wrangler.toml.example" "wrangler.toml"
npm run cf:d1:create:note
npx wrangler d1 create malaysia-flight-deal-radar
npm run cf:d1:migrate:local
npm run cf:d1:migrate:remote
```

Verify tables:

```powershell
npx wrangler d1 execute malaysia-flight-deal-radar --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
npx wrangler d1 execute malaysia-flight-deal-radar --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

The D1 binding is `DB`. The migrations include the airport and route seed data.

## Production Safety Defaults

Keep these enabled in `wrangler.toml` until provider terms and quotas are approved:

```text
ENABLE_REAL_PROVIDERS=false
REAL_PROVIDER_DRY_RUN=true
DEFAULT_REAL_PROVIDER=
MAX_REAL_PROVIDER_SEARCHES_PER_RUN=1
MAX_REAL_PROVIDER_DAILY_BUDGET=1
TELEGRAM_DRY_RUN=true
```

MockProvider remains available for demo data. Amadeus is optional/fallback only. Duffel is optional and quota-limited. Skyscanner remains deferred until access and display/retention terms are confirmed.

## Wrangler Dev

```powershell
npm run check
npm run cf:dev
```

The repository does not require real provider credentials for local verification. If Amadeus or Duffel credentials are missing, those providers remain disabled.

Provider readiness can be checked locally after startup:

```powershell
Invoke-RestMethod "http://localhost:8787/api/provider-health"
```

Expected local behavior:

- `mock` is ready for demo data.
- `amadeus` is disabled when credentials are missing.
- `duffel` is disabled when credentials are missing, real providers are disabled, or dry-run is enabled.
- live search is blocked by default with reason codes such as `real_providers_disabled`, `dry_run_enabled`, or `credentials_missing`.

## Secrets

Keep these values server-side only:

- `ADMIN_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`
- `DUFFEL_ACCESS_TOKEN`
- future `SKYSCANNER_API_KEY`

Use `.dev.vars` locally and Cloudflare secrets for deployed environments. Do not commit `.dev.vars`, `.env`, real tokens, or provider credentials.

For the first mock/demo deployment, do not set `DUFFEL_ACCESS_TOKEN` in Cloudflare. Keep real provider flags disabled and dry-run on.

```powershell
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

Future provider secrets remain server-side only:

```powershell
npx wrangler secret put DUFFEL_ACCESS_TOKEN
npx wrangler secret put AMADEUS_CLIENT_ID
npx wrangler secret put AMADEUS_CLIENT_SECRET
npx wrangler secret put SKYSCANNER_API_KEY
```

Do not put these values in `wrangler.toml`.

## Smoke Checks

After local startup:

```powershell
Invoke-RestMethod "http://localhost:8787/health"
Invoke-RestMethod "http://localhost:8787/api/deals"
Start-Process "http://localhost:8787/dashboard"
```

After deployment, replace the base URL with your Workers URL and run the same smoke checks:

```powershell
$base = "https://<your-worker>.<your-subdomain>.workers.dev"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/provider-health"
Invoke-RestMethod "$base/api/deals"
Start-Process "$base/dashboard"
```

Admin scan should be disabled when `ADMIN_TOKEN` is blank and should reject a wrong bearer token when configured:

```powershell
Invoke-RestMethod -Method Post "$base/api/admin/scan"
Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer wrong-token" }
```

## Cron Triggers

`wrangler.toml.example` schedules scans every six hours in UTC:

```toml
[triggers]
crons = ["0 */6 * * *"]
```

To disable scheduled scans, deploy with:

```toml
[triggers]
crons = []
```

Local Wrangler cron testing:

```powershell
Invoke-RestMethod "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

See `docs/deployment_smoke_checklist.md` for the post-deploy smoke checklist.

## Duffel Sandbox Smoke

Duffel smoke is optional. It searches and revalidates at most one sandbox route and prints only a normalized summary. It does not book, create orders, collect passenger identity, store passports, process payment, ticket flights, or implement checkout.

Before running it, keep `.dev.vars` local and uncommitted, set a Duffel test token, and use a tiny quota:

```powershell
Copy-Item ".dev.vars.example" ".dev.vars"
(Get-Content ".dev.vars") -replace '^DUFFEL_ACCESS_TOKEN=.*', 'DUFFEL_ACCESS_TOKEN=duffel_test_your_local_token' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^ENABLE_REAL_PROVIDERS=.*', 'ENABLE_REAL_PROVIDERS=true' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^REAL_PROVIDER_DRY_RUN=.*', 'REAL_PROVIDER_DRY_RUN=false' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^DEFAULT_REAL_PROVIDER=.*', 'DEFAULT_REAL_PROVIDER=duffel' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^MAX_REAL_PROVIDER_SEARCHES_PER_RUN=.*', 'MAX_REAL_PROVIDER_SEARCHES_PER_RUN=1' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^MAX_REAL_PROVIDER_DAILY_BUDGET=.*', 'MAX_REAL_PROVIDER_DAILY_BUDGET=1' | Set-Content ".dev.vars"
npm run provider:check
npm run duffel:smoke -- --origin KUL --destination SIN --departure-date 2026-09-01 --return-date 2026-09-06
```

Set `REAL_PROVIDER_DRY_RUN=true` again after the controlled smoke test.

## Phase 6 Readiness

Before promoting any real provider beyond optional smoke tooling, confirm:

- partner API access is approved
- allowed fare display and retention terms are known
- raw payload storage remains disabled unless explicitly allowed
- revalidation is available before alert or deep-link display
- rate limits and daily budgets are configured
- tests use mocked HTTP only
- `ENABLE_REAL_PROVIDERS=true` is used only in controlled environments
- `REAL_PROVIDER_DRY_RUN=false` is set only after partner terms and quota limits are confirmed
- `DEFAULT_REAL_PROVIDER` is explicitly set

Do not make Amadeus the only provider. Do not add Skyscanner until partner access and compliance constraints are explicitly approved. Duffel remains optional and quota-limited until production terms, retention, rate limits, and display rules are verified.

## Rollback

To make the deployed Worker inert from real-provider perspective, set safe vars back to:

```text
ENABLE_REAL_PROVIDERS=false
REAL_PROVIDER_DRY_RUN=true
DEFAULT_REAL_PROVIDER=
TELEGRAM_DRY_RUN=true
```

Then redeploy. To stop cron-triggered scans, deploy with `crons = []`. Rotate provider credentials at the provider if a secret is suspected to be exposed.

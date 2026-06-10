# Deployment Readiness

Phase 5.5 prepares the repository for local verification and Cloudflare Worker deployment setup. It is not a real-provider launch phase.

Phase 6A adds real-provider readiness guardrails. Phase 6B adds a guarded Duffel adapter, and Phase 6C adds optional Duffel sandbox smoke tooling. Real providers are still off by default and dry-run protected.

## Current Runtime Surfaces

- Worker entrypoint: `src/index.ts`
- Local demo server: `npm run dev`
- Deterministic seed: `npm run seed`
- Deterministic MockProvider scan: `npm run demo:scan`
- Provider readiness CLI: `npm run provider:check`
- Optional Duffel sandbox smoke: `npm run duffel:smoke`
- Verification bundle: `npm run check`

## Wrangler Setup

Copy the example config:

```powershell
Copy-Item "wrangler.toml.example" "wrangler.toml"
```

Create and bind D1:

```powershell
npx wrangler d1 create malaysia-flight-deal-radar-local
```

Paste the returned IDs into `wrangler.toml`, then apply migrations locally:

```powershell
npx wrangler d1 migrations apply malaysia-flight-deal-radar-local --local
```

Run the Worker with Wrangler:

```powershell
npx wrangler dev
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
- future provider credentials

Use `.dev.vars` locally and Cloudflare secrets for deployed environments. Do not commit `.dev.vars`, real tokens, or provider credentials.

## Smoke Checks

After local startup:

```powershell
Invoke-RestMethod "http://localhost:8787/health"
Invoke-RestMethod "http://localhost:8787/api/deals"
Start-Process "http://localhost:8787/dashboard"
```

Admin scan should be disabled when `ADMIN_TOKEN` is blank and should reject a wrong bearer token when configured.

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

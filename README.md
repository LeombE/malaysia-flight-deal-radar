# Malaysia Flight Deal Radar

Real-time-ish flight deal radar for Malaysia-based travelers. The system scans round-trip economy fares from Malaysian origins to selected Asia destinations, detects unusually cheap MYR fares, and can alert users after provider revalidation.

This repository currently contains the provider scaffold, an optional Amadeus fallback scaffold, and a Duffel adapter behind real-provider guardrails. It is not a booking engine and does not store passenger identity, passport data, payment data, checkout state, order state, or ticketing state.

## Phase 2 Modules

- D1 migrations live in `migrations/`.
- Airport seed data lives in `src/seeds/airports.ts` and `migrations/0002_seed_airports.sql`.
- Deal scoring lives in `src/scoring/`.
- Duplicate alert prevention lives in `src/alerts/duplicate-alerts.ts`.
- Scheduled scan planning/execution lives in `src/scanner/`.
- D1 scan persistence helpers live in `src/db/d1-scan-repository.ts`.
- Telegram alert eligibility, formatting, and sending live in `src/alerts/`.
- JSON API routes and dashboard rendering live in `src/routes/`.
- Worker entry points live in `src/index.ts`.

All persisted MYR prices use integer minor units:

- `amount_minor_myr`
- `baseline_median_minor_myr`
- `historical_p10_minor_myr`

The scoring engine uses median and p10 baselines instead of average prices because flight fares often contain outliers. A stale provider fare is never treated as a live fare; it must be revalidated before alerting or display. A suspected deal is also not a confirmed airline promotion unless a provider explicitly returns promotion or campaign metadata.

## Scheduler

Phase 3 adds a cron-ready scan runner. It scans in bounded batches rather than brute-forcing every route so the app can respect partner API budgets, rate limits, and Cloudflare Worker execution limits.

Route priority is deterministic:

1. active watchlist routes
2. routes with previous `strong_deal` or `suspected_deal`
3. popular seed routes
4. exploration routes ordered by oldest scan time

The scheduler writes search jobs, fare checks, normalized fare snapshots, and deal scores. It attempts provider revalidation before any offer can become alert/display eligible. Phase 4 adds Telegram alert evaluation after scoring; Telegram failures are recorded but do not fail the scan.

Amadeus remains optional/fallback only. Duffel is present as a guarded Phase 6B adapter. The scheduler works through the provider registry and skips disabled or dry-run-blocked providers safely.

## Telegram Alerts

Telegram is disabled unless both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured. Alerts are only sent for fresh, revalidated `suspected_deal` or `strong_deal` results with score `>= 70`, and duplicate alerts are blocked during `ALERT_COOLDOWN_HOURS`.

See `docs/telegram_alerts.md` for setup and safety notes.

## Dashboard And API

Phase 5 adds a minimal Cloudflare Worker HTTP surface:

- `GET /health`
- `GET /api/origins`
- `GET /api/destinations`
- `GET /api/deals`
- `GET /api/price-history`
- `GET /api/provider-health`
- `POST /api/admin/scan`
- `POST /api/admin/revalidate`
- `GET /` and `GET /dashboard`

The dashboard shows origin, region, country, destination, departure date, and stay-length filters. Deal cards include RM price, baseline, discount, last verified time, provider, and stale/expired warnings.

Phase 5.6 polish adds dashboard filters for deal label and minimum score. Deal cards now separate `Baseline median`, `Historical p10`, `Deal label`, `Provider`, `Last verified`, and `Alert status`.

Stale or expired cached fares can appear as historical context, but they are never marked as live. `/api/deals?only_recently_verified=true` returns only fresh, recently revalidated results.

Admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`. If `ADMIN_TOKEN` is missing, admin endpoints are disabled. The revalidate endpoint is a safe authenticated stub in this phase.

See `docs/api.md` and `docs/dashboard.md`.

## Local Runtime

Use Node.js and npm from Windows PowerShell:

```powershell
cd "C:\Users\Admin\OneDrive\Documents\flight API real time"
npm install
npm run typecheck --if-present
npm test --if-present
```

Create deterministic demo data and run one MockProvider scan:

```powershell
npm run seed
npm run demo:scan
```

Start the local demo server:

```powershell
npm run dev
```

Stop the local server with `Ctrl+C` in the PowerShell window running `npm run dev`.

Open the dashboard:

```powershell
Start-Process "http://localhost:8787/dashboard"
```

Verify JSON endpoints:

```powershell
Invoke-RestMethod "http://localhost:8787/health"
Invoke-RestMethod "http://localhost:8787/api/deals"
```

Expected local URLs:

- dashboard: `http://localhost:8787/dashboard`
- health: `http://localhost:8787/health`
- deals API: `http://localhost:8787/api/deals`
- provider health: `http://localhost:8787/api/provider-health`

The deterministic demo scan should produce `strong_deal`, `suspected_deal`, and `no_deal` records. Dashboard cards show `Freshly verified`, `Stale / needs revalidation`, or `Expired` when applicable.

To reset and rerun demo data:

```powershell
npm run seed
npm run demo:scan
```

`npm run seed` writes `demo-data/demo-state.json`. The `demo-data/` directory is ignored by Git and should not be committed.

The local demo uses deterministic `MockProvider` data only. It does not require Amadeus, Skyscanner, Duffel, Telegram, or any real provider credentials.

## Local Admin Scan

If `ADMIN_TOKEN` is missing, `POST /api/admin/scan` is disabled:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8787/api/admin/scan"
```

To enable it locally, copy `.dev.vars.example` to `.dev.vars`, set a placeholder local token, restart `npm run dev`, then call:

```powershell
Copy-Item ".dev.vars.example" ".dev.vars"
(Get-Content ".dev.vars") -replace '^ADMIN_TOKEN=.*', 'ADMIN_TOKEN=local-demo-token' | Set-Content ".dev.vars"
Invoke-RestMethod -Method Post "http://localhost:8787/api/admin/scan" -Headers @{ Authorization = "Bearer local-demo-token" }
```

Never commit `.dev.vars` or real secrets.

## Cloudflare D1 Setup

`npm run dev` uses the in-memory/JSON demo path. For Cloudflare-style D1 work, copy the example Wrangler config and create a real local D1 binding:

```powershell
Copy-Item "wrangler.toml.example" "wrangler.toml"
npx wrangler d1 create malaysia-flight-deal-radar-local
npx wrangler d1 migrations apply malaysia-flight-deal-radar-local --local
npx wrangler dev
```

Update `wrangler.toml` with the database IDs returned by Wrangler. The migrations include the airport seed migration.

## Environment

Copy `.dev.vars.example` to `.dev.vars` for local development. Never commit real secrets.

Duffel and Amadeus are optional. Amadeus is disabled unless both `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` are present. Duffel is disabled unless `DUFFEL_ACCESS_TOKEN` is present and every real-provider guardrail allows it.

Duffel test tokens beginning with `duffel_test_` are reported as `test_mode=true` in provider readiness output. Token values are never returned by health APIs and must not be logged.

Real providers are also blocked by Phase 6A guardrails unless all of these are true:

- `ENABLE_REAL_PROVIDERS=true`
- `REAL_PROVIDER_DRY_RUN=false`
- `DEFAULT_REAL_PROVIDER` names the provider
- required provider credentials are configured
- provider budget remains available
- retention, currency, and revalidation checks pass

Check safe readiness output with:

```powershell
Invoke-RestMethod "http://localhost:8787/api/provider-health"
```

MockProvider remains the default local/demo provider. Readiness output shows booleans and reason codes only; it must not expose secrets.

To intentionally test Duffel with mocked-safe local readiness, copy `.dev.vars.example` to `.dev.vars`, add a placeholder or real test token locally, keep dry-run enabled, and inspect provider health:

```powershell
Copy-Item ".dev.vars.example" ".dev.vars"
(Get-Content ".dev.vars") -replace '^DUFFEL_ACCESS_TOKEN=.*', 'DUFFEL_ACCESS_TOKEN=duffel_test_placeholder' | Set-Content ".dev.vars"
npm run dev
Invoke-RestMethod "http://localhost:8787/api/provider-health"
```

Keep `REAL_PROVIDER_DRY_RUN=true` until you intentionally want the Worker to call Duffel. The current adapter searches and retrieves offers only; it does not create orders, book flights, collect passenger identity, process payment, ticket flights, or implement checkout.

More detail:

- `docs/local_demo.md`
- `docs/deployment_readiness.md`
- `docs/provider_readiness.md`
- `docs/provider_selection.md`
- `docs/providers/duffel.md`

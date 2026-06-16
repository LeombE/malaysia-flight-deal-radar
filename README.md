# Malaysia Flight Deal Radar

Cloudflare Worker application for monitoring Malaysia-origin round-trip economy fares, scoring likely deals against historical baselines, and presenting a safe KUL Asia cached price calendar.

Live demo: https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/dashboard
Price calendar: https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/calendar

## Project Summary

Malaysia Flight Deal Radar helps Malaysia-based travelers watch routes from `JHB`, `KUL`, and `SZB` to selected Asia destinations. The deployed demo currently uses controlled mock fare data, and Phase 8B adds a KUL Asia Price Calendar for recently found cached fares.

This is not a booking engine. It does not implement checkout, payment, ticket issuance, order creation, passenger identity storage, or passport handling.

## Problem Statement

Flight prices are volatile, noisy, and hard to compare manually. A cheap-looking fare is only useful if it is meaningfully below its own route history, fresh enough to trust, and compliant with provider display/retention rules.

This project models that workflow end to end:

- collect normalized fare observations
- calculate route-specific baselines
- score current offers
- warn when fare data is stale or expired
- expose deal cards and a cached price calendar through dashboard/API routes
- keep real-provider activation behind explicit safety gates

## Target Users And Stakeholders

- Malaysia-based travelers watching regional and long-haul Asia routes
- portfolio reviewers evaluating full-stack/data-system implementation quality
- future operators who need provider-budget, retention, and stale-fare controls before enabling live providers
- developers extending the provider registry, scoring logic, or alerting workflow

## Verified Deployment Evidence

Current deployed mock/demo status:

- `/health` works
- `/api/provider-health` works
- `/api/deals` works
- `/api/price-calendar` works locally with controlled cached fare rows
- `/dashboard` works
- `/calendar` renders a KUL Asia Price Calendar
- `strong_deal` count = 2
- `suspected_deal` count = 2
- `no_deal` count = 5
- mock provider is healthy
- real providers are disabled
- no secrets are exposed by health/report endpoints

Verified highlighted demo rows:

- `SZB -> NRT`: `strong_deal`, score 94
- `KUL -> BKK`: `strong_deal`, score 90
- `KUL -> TPE`: `suspected_deal`, score 71
- `JHB -> BKK`: `suspected_deal`, score 70
- `KUL -> SIN`: `no_deal`, score 0

Generate a sanitized deployment report:

```powershell
npm run cf:demo:report:remote -- --base-url "https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev"
```

## Key Features

- Cloudflare Worker dashboard and JSON API
- D1 schema for airports, route candidates, scan jobs, fare checks, fare snapshots, scores, alerts, provider limits, settings, watchlist, and cached price calendar rows
- deterministic mock provider for local and deployed demo data
- provider abstraction with guarded Duffel sandbox adapter and optional Amadeus fallback scaffold
- Travelpayouts cached fare provider scaffold for recently found fares, disabled by default
- KUL Asia Price Calendar with low-to-high RM sorting and cached/live warnings
- median/p10-based deal scoring using integer MYR minor units
- stale, expired, and revalidation-aware display logic
- scheduled scan runner with route priority and provider budget controls
- Telegram alert module with deduplication, currently disabled unless explicitly configured
- read-only deployment health report for portfolio/release evidence
- remote demo seed/reset tooling for reproducible dashboard evidence

## Architecture Overview

```text
Cloudflare Worker
  |-- routes: dashboard, calendar, health, APIs, admin scan
  |-- scheduler: cron/admin scan runner
  |-- providers: MockProvider, Travelpayouts cached provider, Duffel adapter, Amadeus fallback scaffold
  |-- scoring: median, p10, discount, quality penalties
  |-- alerts: eligibility, formatting, duplicate prevention
  |-- reports: sanitized deployment health snapshot
  `-- D1: normalized operational and historical tables
```

Detailed architecture: `docs/architecture.md`.

## Tech Stack

- TypeScript strict mode
- Cloudflare Workers
- Cloudflare D1
- Wrangler
- Node.js test runner
- HTML/CSS dashboard rendered by the Worker
- MockProvider for deterministic demo data

## Data Flow

1. Route candidates are seeded for Malaysia origins and Asia destinations.
2. Scheduler prioritizes watchlist routes, previous deal routes, popular seed routes, then exploration routes.
3. Provider registry selects enabled providers. The deployed demo uses MockProvider only.
4. Normalized offers are revalidated before alert/display eligibility.
5. Fare checks and fare snapshots are persisted in D1.
6. Scoring compares current MYR price against historical median and p10.
7. Dashboard/API show sorted deal cards with baseline, discount, provider, and freshness warnings.
8. Optional alert logic evaluates score, freshness, provider display rules, and duplicate cooldown.

Price calendar flow:

1. KUL Asia destination seeds cover Southeast Asia, Taiwan, Japan, and China.
2. Controlled demo calendar rows are seeded for KUL routes such as TPE, BKK, SIN, NRT, KIX, PVG, and CAN.
3. Travelpayouts normalization can ingest cached latest/month/week matrix responses when explicitly enabled.
4. `/api/price-calendar` returns normalized rows sorted by RM price, stops, duration, then departure date.
5. `/calendar` displays cached/recently found fares with explicit recheck warnings and no live/bookable claim.

## Deal Scoring Methodology

Prices are stored as integer MYR minor units, not floating point. The scoring engine calculates:

- historical median
- historical p10
- sample size
- discount percentage
- itinerary quality penalties
- score from 0 to 100
- deal label

Labels include:

- `no_deal`
- `watched_price`
- `suspected_deal`
- `strong_deal`
- `urgent_revalidate`
- `expired`

Median is used instead of average because fare histories often contain outliers. `suspected_deal` means the fare is statistically cheap against observed history; it does not mean the airline has confirmed a promotion.

More detail: `docs/scoring_methodology.md`.

## Safety Design

- real providers disabled by default
- cached fare providers disabled and dry-run protected by default
- no scraping of Google Flights, airline sites, OTA sites, login-protected pages, or CAPTCHA-protected pages
- no booking, order, payment, ticket, passport, or passenger identity storage
- no raw provider payload persistence by default
- no stale cached provider result is shown as a live fare
- Travelpayouts Data API rows are treated as cached/recently found fares, not guaranteed live fares
- provider-derived display/deep-link content requires revalidation
- secrets stay out of repository files
- tests use mocked HTTP only

## Provider Readiness Design

The provider registry supports multiple providers but keeps live providers behind guardrails:

- MockProvider is the default demo provider.
- Travelpayouts is a cached data provider, disabled unless explicitly configured.
- Duffel sandbox adapter exists and is tested, but is not enabled on Cloudflare.
- Amadeus remains optional/fallback and disabled without credentials.
- Skyscanner is intentionally deferred until access and terms are confirmed.

Provider readiness reports show whether a provider is configured, enabled, dry-run blocked, budget blocked, cached-only, or disabled. Public readiness output must not expose credentials.

More detail: `docs/provider_readiness.md` and `docs/provider_compliance.md`.

## Cloudflare Deployment Notes

The project is deployed as a Cloudflare Worker with D1. Production-like safety defaults keep live providers off and dry-run protected.

Useful commands:

```powershell
npm run cf:check
npm run cf:d1:migrate:remote
npm run cf:demo:verify:remote
npm run cf:demo:report:remote -- --base-url "https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev"
```

Remote demo maintenance:

```powershell
npm run cf:demo:reset:remote
```

After reset, trigger the protected admin scan from your shell with the configured Cloudflare secret value. Do not write that value to repository files.

More detail: `docs/cloudflare_deployment.md`.

## Current Demo Status

The deployed demo is intentionally mock-backed. It demonstrates the full application workflow with controlled fare data:

- Cloudflare Worker is live
- D1 is connected
- dashboard and APIs are online
- remote seed/reset/report tooling works
- real providers are disabled
- `/calendar` can show controlled cached fare examples
- no live commercial flight coverage or bookability guarantee is claimed

## Limitations

- deployed demo does not provide live commercial flight coverage
- cached price calendar rows are recently found/demo fares and must be rechecked before purchase
- provider access, rate limits, retention rights, and display rights still need final verification before activation
- Telegram on Cloudflare is implemented but not the focus of the deployed demo evidence
- dashboard is intentionally minimal and operational, not a consumer product UI
- historical baselines are controlled demo data until a real provider is enabled

## Future Roadmap

- Phase 8B: Travelpayouts cached fare provider and KUL Asia Price Calendar
- Phase 8C: Telegram on Cloudflare
- Phase 8D: Skyscanner access preparation
- Phase 8E: real provider activation checklist
- Phase 9: limited live provider dry run
- Phase 10: production monitoring
- Phase 11: GitHub Actions or scheduled report automation

More detail: `docs/roadmap.md`.

## Run Locally

```powershell
cd "C:\Users\Admin\OneDrive\Documents\flight API real time"
npm install
npm run seed
npm run demo:scan
npm run dev
```

Open:

```powershell
Start-Process "http://localhost:8787/dashboard"
Start-Process "http://localhost:8787/calendar"
```

## Run Tests

```powershell
npm run typecheck --if-present
npm test --if-present
npm run cf:check
```

## Deploy Safely

```powershell
npm run cf:check
Copy-Item "wrangler.toml.example" "wrangler.toml"
npm run cf:d1:create:note
npm run cf:d1:migrate:remote
npm run cf:deploy:dry
npm run cf:deploy
```

Keep local Cloudflare IDs in uncommitted `wrangler.toml`. Keep secrets in Cloudflare secret storage, not repo files.

## Keep Real Providers Disabled

For the deployed demo, keep real-provider activation off:

```text
ENABLE_REAL_PROVIDERS=false
REAL_PROVIDER_DRY_RUN=true
DEFAULT_REAL_PROVIDER=
```

Do not configure live/sandbox Duffel or Amadeus on Cloudflare until the real-provider activation checklist is complete. Do not add Skyscanner until access and terms are confirmed.

Keep cached fare providers disabled unless intentionally testing:

```text
ENABLE_CACHED_FARE_PROVIDER=false
CACHED_PROVIDER_DRY_RUN=true
DEFAULT_CACHED_PROVIDER=travelpayouts
```

Do not store a real Travelpayouts token in repository files.

## Supporting Docs

- `docs/architecture.md`
- `docs/screenshots.md`
- `docs/resume_project_summary.md`
- `docs/roadmap.md`
- `docs/cloudflare_deployment.md`
- `docs/deployment_smoke_checklist.md`
- `docs/provider_readiness.md`
- `docs/provider_compliance.md`
- `docs/price_calendar.md`
- `docs/providers/travelpayouts.md`

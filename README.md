# Malaysia Flight Deal Radar

Malaysia Flight Deal Radar is a Cloudflare Workers + D1 flight-deal radar for Malaysia-origin routes. It shows a mock-safe decision-support dashboard, a cached price-calendar demo, provider filtering, scoring guardrails, and clear recheck warnings for portfolio review. The remote demo is intentionally controlled mock/demo data, not live inventory.

Live dashboard: https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/dashboard
Live price calendar: https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/calendar

Latest release: `v0.8.2 Decision UX Polish`

Important safety note: prices in the deployed demo are not live, are not guaranteed bookable, and must be rechecked directly with the airline, OTA, or provider before purchase. This is not a booking engine. It has no checkout, payment flow, ticket issuance, passenger identity storage, or passport handling. No live fare, live coverage, or bookable inventory is claimed.

## Quick Links

- Live dashboard: `https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/dashboard`
- Live price calendar: `https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/calendar`
- Portfolio evidence: `docs/portfolio_evidence.md`
- Screenshot checklist: `docs/screenshots.md`
- Price calendar notes: `docs/price_calendar.md`
- Provider readiness: `docs/provider_readiness.md`
- Provider compliance: `docs/provider_compliance.md`
- Provider selection: `docs/provider_selection.md`
- Real provider activation checklist: `docs/real_provider_activation_checklist.md`
- Skyscanner preparation: `docs/providers/skyscanner.md`
- Travelpayouts notes: `docs/providers/travelpayouts.md`
- Roadmap: `docs/roadmap.md`

## Project Summary

Malaysia Flight Deal Radar helps Malaysia-based travelers and reviewers inspect round-trip economy fare signals from `JHB`, `KUL`, and `SZB` to selected Asia destinations. The deployed demo currently uses controlled mock fare data. Phase 8J improves dashboard and calendar decision support without enabling real providers.

The practical questions the demo answers are:

- where should I fly?
- when should I fly?
- why does this mock deal look interesting?
- what must I recheck before trusting it?

## Problem Statement

Flight prices are volatile, noisy, and easy to misread. A useful fare radar should compare a fare against its own route history, explain the discount, show freshness limits, and prevent stale cached data from being presented as live or bookable.

This project demonstrates that workflow with deterministic demo data, route-level baselines, score labels, provider safety states, and explicit recheck wording.

## Target Users And Stakeholders

- Malaysia-based travelers comparing regional Asia trip options.
- Portfolio reviewers evaluating a serverless TypeScript, Cloudflare Workers, and D1 project.
- Future operators who need provider-budget, retention, freshness, and stale-fare controls before enabling live providers.
- Developers extending provider registry, scoring, calendar, dashboard, or alerting logic.

## Verified Deployment Evidence

Reviewer evidence is split into two lanes:

1. Remote live demo = safe mock/demo deployment only. It proves the deployed Worker, D1, dashboard, APIs, provider health, mock scan flow, and decision-support UI. It does not contain real Travelpayouts imported rows.
2. Local D1 evidence = imported Travelpayouts cached rows. It proves the local cached-import path and source separation without configuring Travelpayouts on Cloudflare.

Current deployed mock/demo status:

- `/health`, `/api/provider-health`, `/api/deals`, and `/api/price-calendar` respond.
- `/dashboard` includes recommended demo deals, cheapest route by region, strongest discount, stale/recheck queue, watchlist routes, and `Why this deal` explanations.
- `/calendar` includes freshness and provider legends, cheapest-date badges, best-score/deal badges when data is available, and clearer recheck wording.
- `strong_deal` count = 2
- `suspected_deal` count = 2
- `no_deal` count = 5
- mock provider is healthy
- real providers are disabled
- Travelpayouts remains disabled on Cloudflare
- no Travelpayouts token is configured remotely

Highlighted demo rows:

- `SZB -> NRT`: `strong_deal`, score 94
- `KUL -> BKK`: `strong_deal`, score 90
- `KUL -> TPE`: `suspected_deal`, score 71
- `JHB -> BKK`: `suspected_deal`, score 70
- `KUL -> SIN`: `no_deal`, score 0

## Portfolio Evidence Guide

Use the remote URLs as controlled mock/demo evidence. Use local D1 evidence only when reviewing imported Travelpayouts cached rows. The remote demo does not contain real Travelpayouts imported rows.

Evidence to highlight:

- Remote demo uses controlled mock data only. Prices are not live and must be rechecked.
- Phase 8J dashboard cards include `Why this deal` explanations based on score, discount, route baseline median, historical p10, stops, and recheck status.
- Phase 8J calendar legends explain that freshness labels are cached/demo freshness labels, not a live guarantee.
- Demo travel dates come from a fixed mock snapshot. Route dates are demo travel dates, not current availability.
- `travelpayouts_demo` means controlled demo seed data.
- `travelpayouts` means local imported cached Travelpayouts evidence only.
- Both Travelpayouts sources are cached discovery records, not live fares or bookable inventory.
- `is_live=false` and `is_bookable_claim=false` remain visible in API/UI evidence.
- No raw provider payloads or secrets are exposed in committed docs, APIs, health checks, or reports.

More detail: `docs/portfolio_evidence.md` and `docs/screenshots.md`.

## What Users Can Do In The Demo

On `/dashboard`, reviewers can inspect:

- top recommended demo deals
- cheapest route by region
- strongest discount
- stale/recheck queue
- watchlist routes
- short `Why this deal` explanations per card

On `/calendar`, reviewers can compare cached/demo rows by:

- route
- provider
- freshness label
- departure and return dates
- stops
- price
- deal score or label when available

Treat every price as demo/cached evidence, not live inventory.

## Data Sources Explained

- `MockProvider`: deterministic mock provider used by the remote demo.
- `travelpayouts_demo`: controlled demo seed rows for the cached price calendar.
- `travelpayouts`: local D1 cached import evidence only. It is not enabled on Cloudflare.
- Skyscanner: documentation and access preparation only. No adapter, credential, API call, or provider-health entry exists.
- Duffel sandbox adapter is tested, but it is not enabled on Cloudflare.
- Amadeus remains optional/fallback and disabled unless explicitly configured in a future activation phase.

Do not claim live commercial flight coverage for the remote demo.

## Key Features

- Server-rendered Cloudflare Worker dashboard and JSON APIs.
- D1 tables for airports, route candidates, scan jobs, fare checks, snapshots, scores, alerts, provider limits, settings, watchlist, and cached price-calendar rows.
- Deterministic mock/demo data for safe remote review.
- Deal scoring with median, p10, discount percentage, quality penalties, score, and label.
- Dashboard decision-support cards for route choice, timing, discount strength, and recheck priorities.
- KUL Asia Price Calendar with low-to-high RM sorting, freshness/provider legends, and no live/bookable claim.
- Provider readiness and compliance guardrails before any real-provider activation.
- Sanitized deployment evidence and screenshot guidance for portfolio review.

## Architecture Overview

```text
Cloudflare Worker
  |-- routes: dashboard, calendar, health, APIs, protected admin scan
  |-- scheduler: cron/admin scan runner
  |-- providers: MockProvider, Travelpayouts cached provider, Duffel sandbox adapter, Amadeus fallback scaffold
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
- HTML/CSS rendered by the Worker
- MockProvider for deterministic demo data

## Data Flow

1. Malaysia-origin route candidates are seeded for selected Asia destinations.
2. Scheduler prioritizes watchlist routes, previous deal routes, popular routes, then exploration routes.
3. Provider registry selects enabled providers. The deployed demo uses MockProvider only.
4. Normalized offers are stored in D1 as fare checks, snapshots, scores, and calendar rows.
5. Scoring compares current MYR price against route-specific historical median and p10.
6. Dashboard and calendar routes render decision support with freshness, source, and recheck warnings.
7. Optional alert logic stays gated behind freshness, provider display rules, and duplicate controls.

## Deal Scoring Methodology

Prices are stored as integer MYR minor units. The scoring engine considers:

- historical median
- historical p10
- sample size
- discount percentage
- itinerary quality penalties
- score from 0 to 100
- deal label

Labels include `no_deal`, `watched_price`, `suspected_deal`, `strong_deal`, `urgent_revalidate`, and `expired`. A `suspected_deal` means the fare is statistically cheap against observed history; it does not mean an airline or provider confirmed a promotion.

More detail: `docs/scoring_methodology.md`.

## Safety Design

- real providers disabled by default
- cached fare providers disabled and dry-run protected by default
- no scraping of Google Flights, airline sites, OTA sites, login-protected pages, or CAPTCHA-protected pages
- no checkout, payment flow, ticket issuance, passport handling, or passenger identity storage
- no raw provider payload persistence by default
- no stale cached provider result is shown as a live fare
- Travelpayouts Data API rows are treated as cached/recently found fares, not guaranteed live fares
- provider-derived display or deep-link content requires revalidation before trusted use
- secrets stay out of repository files
- tests use mocked HTTP only

## Provider Readiness Design

Provider support exists behind explicit guardrails:

- MockProvider is the default demo provider.
- Travelpayouts is a cached-data provider and remains disabled on Cloudflare.
- Duffel sandbox adapter is tested, but not enabled on Cloudflare.
- Amadeus remains optional/fallback and disabled without credentials.
- Skyscanner is documentation-only preparation until official access, terms, retention, rate-limit, display, deep-link, and freshness/revalidation rules are confirmed.

Provider readiness reports show whether a provider is configured, enabled, dry-run blocked, budget blocked, cached-only, or disabled. Public readiness output must not expose credentials.

More detail: `docs/provider_readiness.md`, `docs/provider_compliance.md`, `docs/provider_selection.md`, `docs/providers/skyscanner.md`, and `docs/real_provider_activation_checklist.md`.

## Cloudflare Deployment Notes

The remote demo is deployed as a Cloudflare Worker with D1. It is safe for portfolio review because provider activation remains off and the visible data is controlled mock/demo data.

Remote demo maintenance is documented in `docs/cloudflare_deployment.md` and includes `cf:demo:cleanup:remote`, `cf:demo:seed:remote`, `cf:demo:verify:remote`, and the protected `/api/admin/scan` route. Run deploy dry-run before any real deploy, and keep secrets out of repository files.

## Current Demo Status

- Remote demo: online, mock/demo-only, dashboard and calendar available.
- Dashboard: Phase 8J decision UX polish is complete.
- Calendar: cached/demo provider and freshness explanations are visible.
- Travelpayouts: local cached-row evidence only, not enabled on Cloudflare.
- Skyscanner: access preparation docs only, no integration.
- Real providers: disabled.
- Live commercial coverage: not claimed.
- Demo dates: fixed mock snapshot for deterministic review.

## Limitations

- The deployed demo does not provide live commercial flight coverage.
- Cached/demo calendar rows are recently found/demo-style evidence and must be rechecked before purchase.
- Demo travel dates come from a fixed mock snapshot and can look old over time.
- Freshness labels describe cached/demo freshness, not a live availability guarantee.
- Provider access, rate limits, retention rights, display rights, and revalidation rules still need final verification before activation.
- Skyscanner is documentation-only preparation.
- Historical baselines are controlled demo data until a real provider is explicitly enabled in a future phase.

## Future Roadmap

- v0.8.2: Decision UX polish for dashboard and calendar is complete.
- Next: complete provider activation checklist before any real-provider enablement.
- Future: limited live dry-run only after provider terms, retention, display, freshness, budget, and revalidation gates are satisfied.
- Future: production monitoring and alert evidence.
- Future: GitHub Actions or scheduled report automation.

More detail: `docs/roadmap.md`.

## Run Locally

```powershell
cd "C:\Users\Admin\OneDrive\Documents\flight API real time"
npm install
npm run check
npm run cf:check
npm run dev
```

Then open:

- `http://localhost:8787/dashboard`
- `http://localhost:8787/calendar`

## Run Tests

```powershell
npm run check
npm run cf:check
git status
npm run travelpayouts:check
```

Expected safe Travelpayouts state:

```text
enabled: false
dry_run: true
can_search_cached: false
```

## Deploy Safely

```powershell
npm run cf:check
npm run cf:deploy:dry
npm run cf:deploy
```

Only deploy after checks pass. Keep real providers disabled, keep provider secrets outside the repository, and confirm the deployment still presents itself as mock/demo-only.

## Keep Real Providers Disabled

For the deployed demo, keep real-provider activation off. Do not enable Travelpayouts, Skyscanner, Duffel, or Amadeus on Cloudflare until the activation checklist is complete and the provider-specific terms are verified.

Safe public state:

```text
real providers: disabled
cached provider: disabled by default
remote demo data: controlled mock/demo
live fare claim: none
booking/payment/passenger data: none
```

## Portfolio Summary

Developed a serverless Malaysia Flight Deal Radar using TypeScript, Cloudflare Workers, and D1, featuring a mock-safe decision-support dashboard, cached fare calendar, provider filtering, local Travelpayouts cached-data evidence, and real-provider activation guardrails.

## Supporting Docs

- `docs/architecture.md`
- `docs/portfolio_evidence.md`
- `docs/screenshots.md`
- `docs/price_calendar.md`
- `docs/provider_readiness.md`
- `docs/provider_compliance.md`
- `docs/provider_selection.md`
- `docs/real_provider_activation_checklist.md`
- `docs/providers/skyscanner.md`
- `docs/providers/travelpayouts.md`
- `docs/roadmap.md`
- `docs/resume_project_summary.md`
- `docs/cloudflare_deployment.md`
- `docs/deployment_smoke_checklist.md`
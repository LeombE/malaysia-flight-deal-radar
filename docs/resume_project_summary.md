# Resume Project Summary

## Two-Line Resume Version

- Built and deployed a Cloudflare Worker flight-deal radar for Malaysia-origin routes, with D1 persistence, scheduled scans, median/p10 scoring, dashboard/API views, KUL Asia cached price calendar, and sanitized deployment health reporting.
- Implemented provider-readiness guardrails, mock/demo deployment tooling, local D1 cached-fare evidence, and stale-fare safety controls while keeping real providers disabled until access, retention, and rate-limit terms are verified.

## Detailed STAR Version

Situation: Malaysia-based travelers need a practical way to identify unusually cheap round-trip fares, but fare data is volatile, cached prices can become stale, and real provider access depends on strict retention, rate-limit, and display rules.

Task: Build an end-to-end flight deal radar that demonstrates the data model, scan workflow, scoring logic, dashboard/API, deployment flow, and provider safety controls without claiming live commercial coverage or bookable inventory before provider terms are approved.

Action: Implemented a TypeScript Cloudflare Worker with D1 schema, deterministic MockProvider, provider registry, scheduled scan runner, route prioritization, fare snapshot persistence, median/p10 scoring, stale/expired warnings, Telegram alert eligibility, KUL Asia cached price calendar, remote demo seed/reset scripts, and a sanitized deployment health report. Added Travelpayouts cached-provider guardrails, local D1 import verification, provider-filtered calendar separation between `travelpayouts` and `travelpayouts_demo`, and reviewer-ready documentation that separates remote mock/demo evidence from local D1 cached-data evidence.

Result: Deployed a working online demo showing 2 `strong_deal`, 2 `suspected_deal`, and 5 `no_deal` records from controlled mock data, with `/health`, `/api/provider-health`, `/api/deals`, `/dashboard`, and `/calendar` verified. Local D1 evidence demonstrates imported Travelpayouts cached rows through Cloudflare local dev, while Travelpayouts remains disabled on Cloudflare. The repository includes tests, deployment docs, safety guardrails, screenshot guidance, and honest portfolio evidence.

## Technologies Used

- TypeScript strict mode
- Cloudflare Workers
- Cloudflare D1
- Wrangler local and remote workflows
- SQL migrations and seed/reset scripts
- Node.js built-in test runner
- HTML/CSS dashboard and calendar rendered by the Worker
- provider abstraction and readiness reporting
- deterministic MockProvider fixtures
- cached Travelpayouts Data API normalization and local D1 import tooling
- median/p10 scoring and stale/expired warning design
- sanitized portfolio/deployment reporting

## Technical Skills Demonstrated

- TypeScript application architecture
- D1 schema design and migration workflow
- provider abstraction and adapter boundaries
- deterministic mock data and testable scan workflows
- robust statistics for price scoring
- operational safety around stale data and provider retention rules
- API and dashboard implementation
- cached fare calendar design with explicit non-live warnings
- alert eligibility and deduplication logic
- deployment automation and smoke-check documentation
- reviewer-ready evidence packaging

## Stakeholder Value

- Travelers get route-specific discount signals instead of raw fare lists.
- Operators get provider-budget, retention, and revalidation controls before live data is enabled.
- Reviewers can inspect a deployed full-stack system with persistence, tests, docs, and safety constraints.
- Future maintainers get a clear path from controlled mock/demo deployment to local cached-data validation and later provider activation.

## Why This Is More Than A Toy Project

- It models realistic constraints: provider access, rate limits, data retention, stale fare risk, and alert deduplication.
- It separates remote mock/demo evidence from local D1 Travelpayouts cached-row evidence.
- It includes database migrations, seed/reset scripts, deployment smoke checks, and a health report.
- It has a provider registry and tested adapter boundaries rather than hardcoded mock data in the UI.
- It uses historical baselines and p10/median scoring rather than a fixed price threshold.

## What Not To Claim Yet

- Do not claim live commercial flight coverage.
- Do not claim the remote live demo contains real Travelpayouts imported rows.
- Do not claim live Skyscanner integration.
- Do not claim live Duffel or Amadeus searches on Cloudflare.
- Do not claim Travelpayouts cached rows are live or bookable without rechecking.
- Do not claim booking, ticketing, payment, checkout, passport handling, or passenger identity support.
- Do not claim airline-confirmed promotions unless a future provider explicitly returns campaign metadata.

Accurate wording: real-provider readiness is implemented, the Duffel sandbox adapter is tested, Amadeus remains an optional fallback scaffold, Travelpayouts cached provider support is guarded, the online demo uses controlled mock fare/calendar data, and local D1 evidence demonstrates imported Travelpayouts cached rows without claiming live or bookable fares.

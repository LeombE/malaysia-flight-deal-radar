# Resume Project Summary

## Two-Line Resume Version

- Built and deployed a Cloudflare Worker flight-deal radar for Malaysia-origin routes, with D1 persistence, scheduled scans, route prioritization, median/p10 scoring, dashboard/API views, and sanitized deployment health reporting.
- Implemented provider-readiness guardrails, mock/demo deployment tooling, Duffel sandbox adapter tests, and stale-fare safety controls while keeping real providers disabled until access, retention, and rate-limit terms are verified.

## Detailed STAR Version

Situation: Malaysia-based travelers need a practical way to identify unusually cheap round-trip fares, but fare data is volatile, provider access is constrained, and stale cached fares can be misleading.

Task: Build an end-to-end flight deal radar that demonstrates the data model, scan workflow, scoring logic, dashboard/API, deployment flow, and provider safety controls without claiming live commercial coverage before provider terms are approved.

Action: Implemented a TypeScript Cloudflare Worker with D1 schema, deterministic MockProvider, provider registry, scheduled scan runner, route prioritization, fare snapshot persistence, median/p10 scoring, stale/expired warnings, Telegram alert eligibility, remote demo seed/reset scripts, and a sanitized deployment health report. Added guardrails that keep Duffel and Amadeus disabled on Cloudflare and block real-provider use by default.

Result: Deployed a working online demo showing 2 `strong_deal`, 2 `suspected_deal`, and 5 `no_deal` records from controlled mock data, with `/health`, `/api/provider-health`, `/api/deals`, and `/dashboard` verified. The repository includes tests, deployment docs, portfolio evidence guidance, and provider activation gates.

## Technical Skills Demonstrated

- TypeScript strict-mode application design
- Cloudflare Workers and D1 deployment
- SQL schema design and migration workflow
- provider abstraction and adapter design
- deterministic mock data and testable scan workflows
- robust statistics for price scoring
- operational safety around stale data and provider retention rules
- API and dashboard implementation
- alert eligibility and deduplication logic
- deployment automation and smoke-check documentation
- sanitized reporting for release/portfolio evidence

## Stakeholder Value

- Travelers get a clear view of route-specific discount signals instead of raw fare lists.
- Operators get provider-budget, retention, and revalidation controls before live data is enabled.
- Reviewers can inspect a deployed full-stack system with real persistence, tests, docs, and safety constraints.
- Future maintainers get a clear path from mock demo to controlled provider activation.

## Why This Is More Than A Toy Project

- It models realistic constraints: provider access, rate limits, data retention, stale fare risk, and alert deduplication.
- It separates demo data from provider readiness, avoiding false claims about live coverage.
- It includes database migrations, seed/reset scripts, deployment smoke checks, and a health report.
- It has a provider registry and tested adapter boundaries rather than hardcoded mock data in the UI.
- It uses historical baselines and p10/median scoring rather than a fixed price threshold.

## What Not To Claim Yet

- Do not claim live commercial flight coverage.
- Do not claim live Skyscanner integration.
- Do not claim live Duffel or Amadeus searches on Cloudflare.
- Do not claim booking, ticketing, payment, checkout, passport handling, or passenger identity support.
- Do not claim airline-confirmed promotions unless a future provider explicitly returns campaign metadata.

Accurate wording: real-provider readiness is implemented, the Duffel sandbox adapter is tested, Amadeus remains an optional fallback scaffold, and the online demo currently uses controlled mock fare data.


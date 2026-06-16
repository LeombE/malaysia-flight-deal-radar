# Architecture

Malaysia Flight Deal Radar is a Cloudflare Worker application backed by D1. The deployed portfolio demo uses MockProvider data while preserving the same scan, persistence, scoring, and dashboard pipeline intended for future authorized providers.

## Runtime Overview

```text
Browser / API client
  -> Cloudflare Worker routes
  -> D1 repositories
  -> Scheduler / provider registry
  -> Scoring and alert eligibility
  -> Dashboard, JSON APIs, deployment report
```

## Worker Routes

- `GET /health`: returns Worker status and provider summaries.
- `GET /dashboard` and `GET /`: renders the deal dashboard.
- `GET /api/origins`: lists Malaysia origin airports.
- `GET /api/destinations`: lists destination airports with filters.
- `GET /api/deals`: returns normalized scored deals.
- `GET /api/price-history`: returns normalized fare history.
- `GET /api/provider-health`: returns provider readiness without credentials.
- `POST /api/admin/scan`: protected scan trigger.
- `POST /api/admin/revalidate`: reserved authenticated endpoint.

## D1 Tables

- `airports`: origin and destination airport metadata.
- `route_candidates`: route universe and priorities.
- `search_jobs`: scan job lifecycle.
- `fare_checks`: normalized current provider offer checks.
- `fare_snapshots`: historical price observations in integer MYR minor units.
- `deal_scores`: score, label, baseline, p10, sample size, and alert eligibility.
- `alerts`: alert audit/deduplication records.
- `provider_limits`: budget, concurrency, retention, and health state.
- `settings`: key/value operational settings.
- `watchlist`: user/demo route watchlist entries.

## Provider Abstraction

Providers implement a common interface:

- enabled/disabled state
- round-trip economy search
- offer revalidation
- provider health
- retention mode

The scheduler depends on this abstraction rather than provider-specific code.

## MockProvider

MockProvider is the default local and deployed demo provider. It produces deterministic round-trip economy offers for testing, demo scans, and dashboard evidence. The remote demo seed provides historical baseline snapshots so MockProvider offers can produce `strong_deal`, `suspected_deal`, and `no_deal` examples.

## Duffel Sandbox Adapter

The Duffel adapter builds economy return-trip offer requests, normalizes offer responses, handles short-lived offer semantics, and requires revalidation before display or alerts. It is covered by mocked HTTP tests. It is not enabled on Cloudflare in the current deployment and does not create orders.

## Amadeus Optional Fallback

Amadeus remains an optional fallback scaffold with OAuth, request construction, normalization, pricing revalidation, and retry/backoff behavior. It is disabled unless credentials and real-provider guardrails are explicitly configured. It is not enabled on Cloudflare in the current deployment.

## Scoring Engine

The scoring engine uses:

- historical median
- historical p10
- sample size threshold
- discount percentage
- itinerary quality penalties
- stale and expired offer checks

Scores range from 0 to 100. Labels include `no_deal`, `watched_price`, `suspected_deal`, `strong_deal`, `urgent_revalidate`, and `expired`.

## Telegram Alert Module

The alert module evaluates whether a scored fare can be sent:

- score threshold
- fresh revalidation
- provider display rules
- duplicate alert cooldown
- required route/date/provider/label dedupe key

Telegram delivery is disabled unless configured. Alert failures do not fail scans.

## Admin Scan

The admin scan endpoint calls the same scheduler used by cron. It is protected by an authorization secret configured outside the repository. If the secret is absent, the endpoint is disabled.

## Deployment Report

The deployment report tooling queries read-only endpoints:

- `/health`
- `/api/provider-health`
- `/api/deals`
- `/api/deals?deal_label=strong_deal`
- `/api/deals?deal_label=suspected_deal`

It outputs a sanitized Markdown report with health status, provider readiness, deal counts, top strong deals, and top suspected deals.

## Safety Guardrails

- real providers disabled by default
- dry-run mode enabled by default
- MockProvider remains the deployed demo provider
- Skyscanner is deferred until access and terms are confirmed
- no provider payload caching by default
- no stale provider result is shown as live
- revalidation required before alert/display eligibility
- no booking, payment, ticketing, passport, or passenger identity storage
- tests mock external HTTP

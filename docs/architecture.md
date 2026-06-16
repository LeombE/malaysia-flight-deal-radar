# Architecture

Malaysia Flight Deal Radar is a Cloudflare Worker application backed by D1. The deployed portfolio demo uses MockProvider data for deal scoring and controlled cached fare data for the KUL Asia Price Calendar, while preserving the same safety boundaries intended for future authorized providers.

## Runtime Overview

```text
Browser / API client
  -> Cloudflare Worker routes
  -> D1 repositories
  -> Scheduler / provider registry
  -> Cached fare calendar repository
  -> Scoring and alert eligibility
  -> Dashboard, JSON APIs, deployment report
```

## Worker Routes

- `GET /health`: returns Worker status and provider summaries.
- `GET /dashboard` and `GET /`: renders the deal dashboard.
- `GET /calendar`: renders the KUL Asia Price Calendar.
- `GET /api/origins`: lists Malaysia origin airports.
- `GET /api/destinations`: lists destination airports with filters.
- `GET /api/deals`: returns normalized scored deals.
- `GET /api/price-history`: returns normalized fare history.
- `GET /api/price-calendar`: returns cached/recently found fare calendar rows.
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
- `price_calendar_rows`: cached/recently found calendar fares with live/bookable flags forced false.

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

## Travelpayouts Cached Provider

Travelpayouts is modeled as a cached fare data provider, not a live offer provider. It supports `v2/prices/latest`, `v2/prices/month-matrix`, and `v2/prices/week-matrix` normalization into price calendar rows. Rows are stored without raw payloads, marked `is_live=false`, and displayed with recheck warnings. It is disabled unless cached-provider flags are explicitly enabled, dry-run is off, and a server-side token is configured.

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

## Price Calendar

The calendar is a separate read path from the deal dashboard. It sorts cached rows by RM amount, stops, duration, and departure date, and shows provider/freshness warnings rather than alert eligibility. It is suitable for low-budget discovery but not for claiming a fare is currently bookable.

## Safety Guardrails

- real providers disabled by default
- dry-run mode enabled by default
- MockProvider remains the deployed demo provider
- Skyscanner is deferred until access and terms are confirmed
- Travelpayouts cached data is never labeled live or guaranteed bookable
- no provider payload caching by default
- no stale provider result is shown as live
- revalidation required before alert/display eligibility
- no booking, payment, ticketing, passport, or passenger identity storage
- tests mock external HTTP

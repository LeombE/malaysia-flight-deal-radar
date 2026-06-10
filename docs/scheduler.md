# Scheduler

The scheduler is the cron-facing scan engine for Malaysia Flight Deal Radar. It is provider-agnostic and is tested with `MockProvider` only.

Amadeus exists in this repository as an optional fallback scaffold from an earlier phase. Phase 3 does not expand it and does not add any new real provider. If Amadeus credentials are missing, the registry still includes it, but the scheduler skips it safely as disabled.

## Why Batch Scanning

The destination universe grows quickly when origins, destinations, departure dates, stay lengths, and providers are combined. Brute-force scanning every route on every cron run would waste provider quota, increase rate-limit risk, and produce stale data faster than the app can verify it.

Instead, each cron run creates a bounded batch of search jobs using `MAX_SEARCHES_PER_CRON_RUN` and provider budget settings.

## Route Priority

Routes are selected in this deterministic order:

1. watchlist routes
2. previous `strong_deal` or `suspected_deal` routes
3. popular seed routes
4. exploration routes

Within each bucket, routes are sorted deterministically for testability. Exploration uses oldest scan time first instead of true randomness, which gives long-tail coverage without flaky tests.

## Provider Limits

Provider limits matter because partner APIs usually have daily budgets, concurrency rules, and rate limits. The scheduler enforces:

- `MAX_SEARCHES_PER_CRON_RUN`
- `MAX_PROVIDER_CONCURRENCY`
- `PROVIDER_DAILY_BUDGET`
- provider-specific daily budget and concurrency from `provider_limits`

Providers that are disabled are skipped safely. Repeated provider failures increase provider failure count and can mark provider health as degraded.

## Persistence

Each successful job persists:

- search job lifecycle state
- fare check summary
- normalized fare snapshot using integer MYR minor units
- deal score output

Raw provider payloads are not persisted by the scheduler. Under `NO_CACHE`, only normalized/aggregate-safe data is stored.

`MockProvider` is the default local simulation provider because it is deterministic, requires no credentials, and avoids real network calls in tests. This keeps scheduler behavior testable without depending on partner API availability.

## Revalidation And Alerts

Fares can change quickly. A search response alone is not enough for alert or display eligibility. The scheduler attempts provider revalidation for each offer and only lets the scoring result become alert/display eligible when the revalidated offer is fresh, non-expired, and allowed by provider display rules.

Phase 4 evaluates Telegram alert eligibility after scoring. It records sent, duplicate, disabled, and failed alert outcomes. Telegram failure does not fail the scan because fare collection and notification delivery are separate reliability concerns.

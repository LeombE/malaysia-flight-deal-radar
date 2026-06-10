# Provider Readiness

Phase 6A added safety guardrails for future real provider integrations. Phase 6B adds a Duffel adapter behind those guardrails. Skyscanner is still deferred.

## Defaults

Real providers are disabled by default:

```text
ENABLE_REAL_PROVIDERS=false
REAL_PROVIDER_DRY_RUN=true
DEFAULT_REAL_PROVIDER=
```

These defaults protect local demo runs, tests, dashboard use, cron scans, and admin-triggered scans from accidentally using live API quota.

MockProvider remains the default local/demo provider. Amadeus remains optional fallback only and is disabled unless both Amadeus credentials are configured. Duffel is disabled unless a token is configured and every real-provider guardrail is intentionally opened.

The default real-provider quota is intentionally tiny:

```text
MAX_REAL_PROVIDER_SEARCHES_PER_RUN=1
MAX_REAL_PROVIDER_DAILY_BUDGET=1
```

Raise these only after partner terms, rate limits, display permissions, and retention rules are confirmed.

## Required Before Live Search

A real provider can search live only when all checks pass:

- `ENABLE_REAL_PROVIDERS=true`
- `REAL_PROVIDER_DRY_RUN=false`
- `DEFAULT_REAL_PROVIDER` matches the provider name
- required credentials are configured
- daily budget remains available
- retention mode is supported
- MYR currency support is present
- revalidation support is present

If any check fails, scheduler and admin scans skip the provider safely. Dry-run blocks are recorded as `dry_run_blocked`; other readiness failures are recorded as provider disabled/readiness blocked.

## Readiness Output

Use:

```powershell
npm run provider:check
```

or, after starting the local server:

```powershell
Invoke-RestMethod "http://localhost:8787/api/provider-health"
```

The readiness section reports:

- provider name
- credential configured boolean
- provider enabled boolean
- dry-run boolean
- retention mode
- daily budget and remaining budget
- timeout and retry settings
- `can_search_live`
- `can_revalidate_live`
- `test_mode` for providers that expose safe test-token detection
- blocking reason codes

It must not expose secret values, admin tokens, Telegram tokens, provider credentials, OAuth tokens, raw provider payloads, or revalidation payloads.

In Cloudflare, keep secrets out of `wrangler.toml`. Use `wrangler secret put` for `ADMIN_TOKEN`, Telegram tokens, Duffel, Amadeus, and future provider credentials. `wrangler.toml.example` contains only non-secret defaults.

## Blocking Reasons

Common reasons include:

- `credentials_missing`
- `real_providers_disabled`
- `dry_run_enabled`
- `provider_disabled`
- `provider_not_selected`
- `budget_exhausted`
- `unsupported_retention_mode`
- `missing_currency_support`
- `missing_revalidation_support`
- `unsupported_currency`
- `revalidation_not_available`

Duffel uses `unsupported_currency` and `revalidation_not_available` when those provider-specific checks fail. A token beginning with `duffel_test_` reports `test_mode=true` without exposing the token.

## Cloudflare Defaults

Production deployments should start with:

```text
ENABLE_REAL_PROVIDERS=false
REAL_PROVIDER_DRY_RUN=true
DEFAULT_REAL_PROVIDER=
TELEGRAM_DRY_RUN=true
```

This lets `/health`, `/api/provider-health`, `/api/deals`, the dashboard, and cron smoke checks run without real provider calls. If a provider needs to be rolled back, restore these values and redeploy.

## Duffel Smoke Gates

`npm run duffel:smoke` is stricter than ordinary readiness because it can make one Duffel sandbox search. It refuses unless:

- real providers are enabled
- dry-run is off
- Duffel is the selected provider
- a Duffel test token is configured
- max real searches per run is exactly `1`
- max real-provider daily budget is between `1` and `3`
- the route uses valid future dates

When blocked, it prints reason codes and makes no Duffel network call.

The smoke route can be set with `DUFFEL_SMOKE_ORIGIN`, `DUFFEL_SMOKE_DESTINATION`, `DUFFEL_SMOKE_DEPARTURE_DATE`, `DUFFEL_SMOKE_RETURN_DATE`, `DUFFEL_SMOKE_CABIN_CLASS`, `DUFFEL_SMOKE_ADULTS`, and `DUFFEL_SMOKE_CURRENCY`, or by CLI flags. Defaults remain safe: round-trip economy, one adult, MYR.

If a smoke call succeeds but returns zero offers, this is reported as `no_offers_returned`, not as a credential failure. `provider:check` can show the last sanitized smoke status. For adapter normalization checks, try the Duffel Airways sandbox profile:

```powershell
npm run duffel:smoke -- --profile duffel-airways --departure-date 2026-09-01 --return-date 2026-09-06
```

## Stale Fare Safety

Cached or stale fares are not live fares. The dashboard can show stale data only with warning state, and alerts/deep-link display require fresh revalidation. This remains true after real providers are added.

Skyscanner is still deferred until partner API access, retention rules, display rules, and rate limits are confirmed.

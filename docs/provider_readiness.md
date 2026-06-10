# Provider Readiness

Phase 6A adds safety guardrails for future real provider integrations. It does not add Skyscanner, Duffel, or any new real provider.

## Defaults

Real providers are disabled by default:

```text
ENABLE_REAL_PROVIDERS=false
REAL_PROVIDER_DRY_RUN=true
DEFAULT_REAL_PROVIDER=
```

These defaults protect local demo runs, tests, dashboard use, cron scans, and admin-triggered scans from accidentally using live API quota.

MockProvider remains the default local/demo provider. Amadeus remains optional fallback only and is disabled unless both Amadeus credentials are configured.

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
- blocking reason codes

It must not expose secret values, admin tokens, Telegram tokens, provider credentials, OAuth tokens, raw provider payloads, or revalidation payloads.

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

## Stale Fare Safety

Cached or stale fares are not live fares. The dashboard can show stale data only with warning state, and alerts/deep-link display require fresh revalidation. This remains true after real providers are added.

# Real Provider Activation Checklist

This checklist must be completed before enabling any real flight provider beyond the current safe mock/demo deployment. It applies to Duffel, Amadeus, future Skyscanner work, and any other provider candidate.

Passing this checklist is a documentation and operations gate. It does not enable a provider by itself.

## Activation Boundary

Do not activate a real provider until all items are confirmed:

- official API or partner access is approved
- terms of use match the project use case
- allowed search, display, deep-link, cache, and retention behavior is documented
- budget, quota, concurrency, retry, and rate-limit behavior is documented
- revalidation or freshness handling is documented
- credentials are stored only in approved local or deployment secret storage
- tests are mock-only and deterministic
- rollback and kill-switch steps are documented

Until then, keep:

```text
ENABLE_REAL_PROVIDERS=false
REAL_PROVIDER_DRY_RUN=true
DEFAULT_REAL_PROVIDER=
ENABLE_CACHED_FARE_PROVIDER=false
CACHED_PROVIDER_DRY_RUN=true
```

## Provider Terms

Record the provider-specific answer for each item:

| Check | Required answer before activation |
| --- | --- |
| Access approval | Approved official account/API path |
| Use case | Deal-radar monitoring and user handoff allowed |
| Search scope | Malaysia origins, round trip, economy, one adult allowed |
| Display rules | Price, carrier, itinerary, attribution, caveats, and freshness rules documented |
| Deep links | Exact-offer vs search/recheck link semantics documented |
| Retention | `NO_CACHE` or explicitly allowed normalized retention |
| Raw payloads | Not persisted unless written terms allow it |
| Revalidation | Freshness or revalidation step available before alert/display |
| Rate limits | Daily and per-run limits documented |
| Retries | Backoff, `429`, and transient failure behavior documented |
| MYR | Native MYR support or approved conversion policy documented |
| Public evidence | Portfolio/screenshot language approved and not overclaimed |

## Technical Gates

Before any provider is enabled:

- adapter code must be isolated behind the provider registry
- provider defaults must be disabled
- dry-run must block network calls by default
- readiness output must expose booleans and reason codes only
- errors must be sanitized
- request logs must exclude secrets, raw payloads, and authorization headers
- response persistence must use normalized fields only
- alert/display eligibility must require fresh revalidation when available
- stale or cached results must show explicit warning state
- request budgets must be enforced before network calls
- all tests must mock provider HTTP

## Data Contract

Provider-derived fare records may only store normalized fields required for scoring and display:

- provider name and allowed provider reference
- route and dates
- amount in integer MYR minor units or original currency metadata
- carrier, stops, and duration when allowed
- retrieved, verified, expiry, and freshness timestamps
- retention mode
- display eligibility and revalidation flags
- safe warning text
- safe deep link only when terms allow it

Do not store passenger identity, passport data, payment details, checkout state, booking references, order records, ticketing records, raw provider payloads, tokens, authorization headers, or secret values.

## Cloudflare And Local Operations

For local development:

- keep credentials in ignored local files or approved local secret mechanisms only
- run readiness checks before any smoke command
- keep route/date limits small
- restore dry-run after a controlled smoke test

For Cloudflare:

- keep providers disabled until the checklist and deployment review are complete
- keep secrets out of `wrangler.toml` and repository files
- run configuration checks before deployment
- verify `/api/provider-health` does not expose secret values
- document rollback values and redeploy steps before enabling

This checklist does not instruct anyone to create secrets or run live provider calls. It records the requirements that must be satisfied before those actions are separately approved.

## Provider-Specific Status

| Provider | Current status | Activation blocker |
| --- | --- | --- |
| `mock` | Default demo/test provider | None; not a real provider |
| `travelpayouts` | Cached data provider, local-only evidence path | Cached rows are not live/bookable; Cloudflare remains disabled |
| `duffel` | Adapter exists, disabled by default | Production terms, display rules, retention, and budget controls need final review |
| `amadeus` | Optional fallback scaffold, disabled without credentials | Coverage limitations, terms, and production access need final review |
| `skyscanner` | Documentation-only future candidate | Official access, terms, retention, rate limits, and display rights are unconfirmed |

## Approval Record

Before activation, add a short dated record in the relevant provider document with:

- provider
- environment
- approved access path
- retention mode
- max searches per run
- daily budget
- revalidation method
- rollback values
- verification commands
- reviewer-safe claim language

No provider should be described as live, bookable, or production-ready until this record exists and the activation was verified.
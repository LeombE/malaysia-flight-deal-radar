# Travelpayouts / Aviasales Cached Fare Provider

Travelpayouts is used as a cached fare data provider for the KUL Asia Price Calendar. It is not a live availability provider in this project.

## Supported Cached Data Endpoints

The local smoke tooling supports cached Data API endpoint shapes only:

- `latest` -> `v2/prices/latest`
- `month-matrix` -> `v2/prices/month-matrix`
- `week-matrix` -> `v2/prices/week-matrix`
- `v3-prices-for-dates` -> `aviasales/v3/prices_for_dates`

Endpoint parameters are intentionally endpoint-specific:

- `latest` uses route, currency, `show_to_affiliates`, `period_type`, `beginning_of_period`, `sorting`, `trip_class`, `one_way`, page, low limit, and optional trip duration.
- `month-matrix` uses route, currency, `show_to_affiliates`, and `month`. It does not send latest-only params such as `limit`, `trip_class`, `one_way`, or trip duration.
- `week-matrix` uses route, currency, `show_to_affiliates`, `depart_date`, and `return_date`. It does not send latest-only params.
- `v3-prices-for-dates` uses route, currency, `departure_at`, `return_at`, `sorting`, `direct`, `one_way`, page, and low limit. It does not send v2-only `show_to_affiliates` or trip-duration params.

The provider sends the token in the `x-access-token` header. Tokens must stay server-side and must never be committed, logged, returned by APIs, or shown in screenshots.

## Not Used In This Phase

The Travelpayouts real-time Flight Search API is separate from the cached Data API and is not used in Phase 8C. Do not add marker/signature search, booking, order, payment, ticketing, passenger identity, or passport storage.

## Enablement Gates

Travelpayouts is disabled unless all are true:

- cached fare provider support is enabled
- cached provider dry-run is off
- Travelpayouts is selected as the cached provider
- a server-side Travelpayouts token is configured
- retention mode is `AGGREGATE_ONLY` or `NO_CACHE`

Default deployment values keep it disabled.

## Local Smoke Check

Use Travelpayouts only for a controlled local cached-fare smoke. Do not add the token to Cloudflare yet.

Get a token from your Travelpayouts / Aviasales partner account, then keep it only in local `.dev.vars`:

```powershell
Copy-Item ".dev.vars.example" ".dev.vars"
```

Edit `.dev.vars` locally:

```text
TRAVELPAYOUTS_TOKEN=<local token only>
ENABLE_CACHED_FARE_PROVIDER=true
CACHED_PROVIDER_DRY_RUN=false
DEFAULT_CACHED_PROVIDER=travelpayouts
TRAVELPAYOUTS_SMOKE_ORIGIN=KUL
TRAVELPAYOUTS_SMOKE_DESTINATION=TPE
TRAVELPAYOUTS_SMOKE_ENDPOINT=latest
TRAVELPAYOUTS_SMOKE_DEPARTURE_AT=2026-09
TRAVELPAYOUTS_SMOKE_DEPART_DATE=2026-09-01
TRAVELPAYOUTS_SMOKE_RETURN_DATE=2026-09-06
TRAVELPAYOUTS_SMOKE_TRIP_DURATION=5
TRAVELPAYOUTS_SMOKE_CURRENCY=MYR
TRAVELPAYOUTS_SMOKE_LIMIT=5
```

Check readiness without network access:

```powershell
npm run travelpayouts:check
```

Run at most one low-limit cached request:

```powershell
npm run travelpayouts:smoke -- --origin KUL --destination TPE --endpoint latest --departure-at 2026-09 --depart-date 2026-09-01 --return-date 2026-09-06 --trip-duration 5 --limit 5
```

Alternative endpoint examples:

```powershell
npm run travelpayouts:smoke -- --endpoint month-matrix --origin KUL --destination TPE --departure-at 2026-09 --depart-date 2026-09-01 --return-date 2026-09-06 --limit 5
npm run travelpayouts:smoke -- --endpoint week-matrix --origin KUL --destination TPE --depart-date 2026-09-01 --return-date 2026-09-06 --limit 5
npm run travelpayouts:smoke -- --endpoint v3-prices-for-dates --origin KUL --destination TPE --departure-at 2026-09 --depart-date 2026-09-01 --return-date 2026-09-06 --limit 5
```

The smoke command refuses to run unless cached provider support is enabled, dry-run is off, Travelpayouts is selected, a token is present, and the request limit stays low. It prints normalized summary fields, safe query keys, and error classification only. It never prints the token, request headers, or raw provider payload.

Error classification:

- `request_shape_error`: HTTP 400, usually endpoint/query parameter compatibility.
- `credential_or_access_issue`: HTTP 401 or 403.
- `rate_limited`: HTTP 429.
- `provider_transient_failure`: HTTP 5xx.
- zero rows: successful API call with no cached fares for that route/date window.

After the smoke test, restore:

```text
CACHED_PROVIDER_DRY_RUN=true
ENABLE_CACHED_FARE_PROVIDER=false
```

Cloudflare deployment should keep Travelpayouts disabled until the cached-provider behavior and partner terms have been manually verified.

## Data Semantics

Travelpayouts Data API results are cached/recently found fares. They are useful for low-budget discovery and calendar browsing, but they are not guaranteed live or bookable.

The normalizer forces:

- `is_live=false`
- `is_bookable_claim=false`
- explicit recheck warnings
- no raw payload persistence

## Currency Handling

MYR rows are converted into integer minor units as `amount_minor_myr`.

Non-MYR rows keep:

- `original_amount`
- `original_currency`
- `amount_minor_myr=null`

The project does not perform implicit FX conversion until a verified FX source is added.

## Links

If Travelpayouts returns a safe HTTPS link, the application can expose it as a search/recheck link. If no exact link exists, the application can generate a generic Aviasales search link, but must not claim it preserves the same fare.

## Provider Choice Rationale

Travelpayouts is a practical low-budget MVP source because it provides cached fare discovery without scraping. Amadeus can later supplement limited live checks, but low-cost carrier coverage may be incomplete. Duffel is not the main choice for broad free fare scanning because it is better suited to controlled offer workflows. Skyscanner remains deferred until official access and terms are confirmed.

## Prohibited Scope

Do not use this provider to:

- claim live availability
- claim confirmed bookability
- create orders or bookings
- process payments
- issue tickets
- store passenger identity or passport data
- use the real-time Flight Search API in this phase
- scrape Google Flights, airlines, OTAs, login-protected pages, or CAPTCHA-protected pages

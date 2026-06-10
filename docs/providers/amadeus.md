# Amadeus Provider

`AmadeusProvider` is an optional fallback provider for Malaysia Flight Deal Radar.

## Configuration

Required to enable:

- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`

Optional:

- `AMADEUS_BASE_URL`, default `https://test.api.amadeus.com`
- `AMADEUS_CURRENCY_CODE`, default `MYR`
- `AMADEUS_RETENTION_MODE`, default `NO_CACHE`
- `AMADEUS_MAX_RETRY_ATTEMPTS`
- `AMADEUS_RETRY_BASE_DELAY_MS`
- `AMADEUS_RETRY_MAX_DELAY_MS`
- `AMADEUS_MIN_REQUEST_INTERVAL_MS`
- `AMADEUS_MAX_CONCURRENCY`

## Behavior

- Searches `GET /v2/shopping/flight-offers`.
- Uses `travelClass=ECONOMY`, `adults=1`, round-trip dates, and `currencyCode=MYR` by default.
- Revalidates with `POST /v1/shopping/flight-offers/pricing` before alert or display.
- Keeps raw Amadeus flight-offer payloads transient in memory only for pricing revalidation. Do not persist them under the default `NO_CACHE` policy.
- Handles `429` with `Retry-After` or exponential backoff, and retries transient `5xx` responses.
- Refreshes OAuth once on `401`.

## Coverage Warning

Amadeus Flight Offers Search is not guaranteed to include all low-cost carrier coverage. Treat it as a fallback signal, not as complete market truth.


# Duffel Provider

Duffel is implemented in Phase 6B as the first adapter validation provider. It is disabled by default and should be exercised in sandbox/test-token mode before any production use.

Official API references:

- Create Offer Request: https://duffel.com/docs/api/offer-requests/create-offer-request
- Get Offer: https://duffel.com/docs/api/offers/get-offers

## Safety Defaults

Duffel will not make network calls unless all of these are true:

- `ENABLE_REAL_PROVIDERS=true`
- `REAL_PROVIDER_DRY_RUN=false`
- `DEFAULT_REAL_PROVIDER=duffel`
- `DUFFEL_ACCESS_TOKEN` is configured
- provider budget remains available
- retention mode is `NO_CACHE`
- currency is `MYR`
- revalidation support is available

The local demo and test suite use `MockProvider` by default. All Duffel tests use mocked HTTP responses.

## Test Mode

Set a Duffel test token only in `.dev.vars` or deployment secrets:

```text
DUFFEL_ACCESS_TOKEN=duffel_test_placeholder
```

Tokens beginning with `duffel_test_` are reported as `test_mode=true` in provider readiness output. The token value itself is never returned by `/api/provider-health` and must not be logged.

Create or obtain a test token from the Duffel dashboard according to your account access. Keep `REAL_PROVIDER_DRY_RUN=true` until you are intentionally ready to test one live sandbox HTTP flow against Duffel.

## Request Scope

The adapter creates only offer requests for round-trip economy fare search:

- one adult by default
- two slices: outbound and return
- origin and destination IATA codes
- departure and return dates
- `cabin_class=economy`
- MYR currency where supported

It does not send passenger names, passports, identity documents, payment details, loyalty accounts, or contact information.

## Revalidation

Duffel offers are short-lived. The adapter treats search results as not displayable and not alertable until the offer is revalidated with `GET /air/offers/{id}`. Expired offers are rejected.

Do not show stale cached Duffel fares as live. If revalidation fails, the scheduler can store normalized historical context, but alert/display eligibility remains false.

## Persistence

Default retention is `NO_CACHE`. The app persists normalized fare summaries and integer MYR minor units only. It does not persist raw Duffel payloads by default.

Normalized fields include route, dates, economy cabin, price in MYR minor units, original amount/currency metadata, carriers, stops, total duration, expiry time, and last verified time.

## What This Project Does Not Do

This project is a deal radar, not a booking engine:

- no orders
- no booking creation
- no payment or ticketing
- no checkout
- no passenger identity storage
- no passport storage

Those flows require separate product, compliance, provider-term, payment, and privacy reviews and are intentionally out of scope.

## Local Commands

Run mocked verification:

```powershell
npm run typecheck --if-present
npm test --if-present
```

Check provider readiness without network calls:

```powershell
npm run provider:check
```

Duffel should appear with safe booleans and blocker reason codes unless you intentionally enable all real-provider guardrails.

## Optional Sandbox Smoke

The smoke script is optional and quota-limited. It refuses to call Duffel unless every safety gate passes:

- `ENABLE_REAL_PROVIDERS=true`
- `REAL_PROVIDER_DRY_RUN=false`
- `DEFAULT_REAL_PROVIDER=duffel`
- `DUFFEL_ACCESS_TOKEN` is present
- `DUFFEL_ACCESS_TOKEN` starts with `duffel_test_`
- `MAX_REAL_PROVIDER_SEARCHES_PER_RUN=1`
- `MAX_REAL_PROVIDER_DAILY_BUDGET` is between `1` and `3`
- route dates are valid future dates

Prepare `.dev.vars` locally only:

```powershell
Copy-Item ".dev.vars.example" ".dev.vars"
(Get-Content ".dev.vars") -replace '^DUFFEL_ACCESS_TOKEN=.*', 'DUFFEL_ACCESS_TOKEN=duffel_test_your_local_token' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^ENABLE_REAL_PROVIDERS=.*', 'ENABLE_REAL_PROVIDERS=true' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^REAL_PROVIDER_DRY_RUN=.*', 'REAL_PROVIDER_DRY_RUN=false' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^DEFAULT_REAL_PROVIDER=.*', 'DEFAULT_REAL_PROVIDER=duffel' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^MAX_REAL_PROVIDER_SEARCHES_PER_RUN=.*', 'MAX_REAL_PROVIDER_SEARCHES_PER_RUN=1' | Set-Content ".dev.vars"
(Get-Content ".dev.vars") -replace '^MAX_REAL_PROVIDER_DAILY_BUDGET=.*', 'MAX_REAL_PROVIDER_DAILY_BUDGET=1' | Set-Content ".dev.vars"
```

Run one controlled sandbox smoke:

```powershell
npm run provider:check
npm run duffel:smoke -- --origin KUL --destination SIN --departure-date 2026-09-01 --return-date 2026-09-06
```

The smoke output is normalized only: provider, route, dates, MYR price if returned, carrier, stops, duration, expiry, revalidation time, and readiness status. It does not print the raw Duffel response, access token, Authorization header, or passenger personal data.

After the smoke test, switch dry-run back on:

```powershell
(Get-Content ".dev.vars") -replace '^REAL_PROVIDER_DRY_RUN=.*', 'REAL_PROVIDER_DRY_RUN=true' | Set-Content ".dev.vars"
```

Never commit `.dev.vars` or real tokens.

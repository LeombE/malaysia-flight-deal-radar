# KUL Asia Price Calendar

The price calendar is a low-budget discovery surface for Malaysia-based travelers starting from `KUL` to selected Asia destinations. It is separate from the deal-scoring dashboard.

## What It Shows

- Round-trip economy, one-adult fare rows.
- RM price when the source currency is MYR.
- Original amount and currency for every normalized row.
- Destination region, country, route, dates, stay length, airline, stops, provider, and retrieved timestamp.
- Freshness labels: `fresh`, `recent`, `cached`, `expired`.

## What It Does Not Claim

- It does not claim absolute cheapest market coverage.
- It does not claim a fare is live.
- It does not claim a fare is bookable.
- It does not preserve a specific fare through a generic search link.
- It does not create bookings, orders, payments, tickets, passenger profiles, or passport records.

## Default Filters

`GET /api/price-calendar` defaults to:

- origin: `KUL`
- destination region: `TAIWAN`
- destination: `TPE`
- stay length: `5`
- cabin: `economy`
- adults: `1`
- sort: `price asc`

Default sorting is:

1. `amount_minor_myr` ascending
2. stops ascending
3. total duration ascending when available
4. departure date ascending

Provider filters:

- `provider_name=travelpayouts` shows local D1 rows imported from Travelpayouts cached Data API.
- `provider_name=travelpayouts_demo` shows controlled demo seed rows.
- no provider filter keeps the current all-provider behavior.

## UI Route

`GET /calendar` renders the same records as a table. It includes a provider filter for all providers, Travelpayouts cached rows, and demo seed rows. Every Travelpayouts/demo row must show:

- "Cached fare data only. Not live. Recheck before purchase. Prices may have changed."
- "Cached fare from recent searches. Recheck before purchase."
- "Not guaranteed live."
- "Price may have changed."
- a source badge: "Real cached data" for `travelpayouts` or "Demo seed data" for `travelpayouts_demo`

## Data Safety

Travelpayouts Data API rows are cached/recently found data. The application stores only normalized summaries and keeps:

- `is_live=false`
- `is_bookable_claim=false`
- no raw provider payload
- no passenger identity
- no passport data
- no payment or booking state

Expired rows are hidden by default unless explicitly requested with `include_expired=true`.

## Travelpayouts Smoke Workflow

`npm run travelpayouts:check` reports whether the cached provider is configured, enabled, dry-run blocked, and able to search cached data. It does not make a network call.

`npm run travelpayouts:smoke` is a local-only optional check. It can make one low-limit request to Travelpayouts only after all safety gates are opened in `.dev.vars`. A successful smoke response means the cached Data API call and normalization path worked; it does not prove the fare is live, bookable, or still available.

The smoke command supports endpoint-specific request shapes for `latest`, `month-matrix`, `week-matrix`, and `v3-prices-for-dates`. It prints safe query keys so request-shape debugging can happen without printing tokens, request headers, or raw provider payloads.

If the smoke returns zero rows, treat it as a cached-data route/date availability result, not a credential failure. If it returns HTTP 400, treat it as `request_shape_error`; adjust endpoint/date parameters rather than rotating credentials. HTTP 401/403 means credential/access issue.

Keep the deployed Cloudflare demo on controlled calendar rows until Travelpayouts access, retention behavior, quota limits, and display rules are manually verified.


## Local Travelpayouts Import

`npm run travelpayouts:import:local` can pull a low-limit cached Data API response and upsert normalized rows into local D1 `price_calendar_rows`. It is local-only in Phase 8D.

Use a dry-run first:

```powershell
npm run travelpayouts:import:local -- --endpoint week-matrix --origin KUL --destination BKK --currency MYR --depart-date 2026-08-17 --return-date 2026-08-22 --trip-duration 5 --limit 5 --dry-run-import true
```

Then import locally:

```powershell
npm run travelpayouts:import:local -- --endpoint week-matrix --origin KUL --destination BKK --currency MYR --depart-date 2026-08-17 --return-date 2026-08-22 --trip-duration 5 --limit 5 --dry-run-import false
npm run travelpayouts:import:verify:local
```

The import does not create a remote Cloudflare path and does not write raw payloads. It stores rows as cached discovery data with `is_live=0`, `is_bookable_claim=0`, and `retention_mode='AGGREGATE_ONLY'`.

Repeated imports are idempotent for the same logical fare candidate. The stable key excludes `retrieved_at`; a changed retrieved timestamp updates freshness-related fields instead of creating duplicate rows.

After importing, verify through Cloudflare Worker local dev, which reads Wrangler local D1:

```powershell
npm run cf:dev
Start-Process "http://127.0.0.1:8787/calendar?provider_name=travelpayouts&destination_iata=BKK"
Start-Process "http://127.0.0.1:8787/calendar?provider_name=travelpayouts_demo&destination_iata=BKK"
Start-Process "http://127.0.0.1:8787/api/price-calendar?provider_name=travelpayouts&destination_iata=BKK&include_expired=true"
Start-Process "http://127.0.0.1:8787/api/price-calendar?provider_name=travelpayouts_demo&destination_iata=BKK&include_expired=true"
```

`npm run dev` is optional for the local demo path only; use `npm run cf:dev` for imported local D1 evidence.

Cloudflare remains disabled for Travelpayouts in this phase. Keep the token only in local `.dev.vars` and restore dry-run after testing.
## Demo Routes

The controlled demo includes KUL rows for:

- `TPE`
- `BKK`
- `SIN`
- `NRT`
- `KIX`
- `PVG`
- `CAN`

These rows exist to demonstrate sorting, filters, warning labels, and cached-fare semantics without requiring real provider credentials.

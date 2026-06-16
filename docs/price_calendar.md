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

## UI Route

`GET /calendar` renders the same records as a table. Every Travelpayouts/demo row must show:

- "Cached fare from recent searches. Recheck before purchase."
- "Not guaranteed live."
- "Price may have changed."

## Data Safety

Travelpayouts Data API rows are cached/recently found data. The application stores only normalized summaries and keeps:

- `is_live=false`
- `is_bookable_claim=false`
- no raw provider payload
- no passenger identity
- no passport data
- no payment or booking state

Expired rows are hidden by default unless explicitly requested with `include_expired=true`.

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

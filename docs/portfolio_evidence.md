# Portfolio Evidence: Phase 8E Price Calendar Source Separation

This evidence is for the local-only Travelpayouts cached Data API import path and the price calendar source-separation UI. It must not be presented as live fare coverage, bookable inventory, or a deployed real-provider integration.

## What This Proves

- local Wrangler D1 can hold normalized `price_calendar_rows` imported from Travelpayouts cached data
- `/api/price-calendar` can filter imported cached rows with `provider_name=travelpayouts`
- `/api/price-calendar` can filter controlled demo rows with `provider_name=travelpayouts_demo`
- `/calendar` visibly separates "Real cached data" from "Demo seed data"
- all rows remain `is_live=false`, `is_bookable_claim=false`, and require recheck before purchase

## Commands To Capture

Run local Cloudflare Worker dev so the app reads Wrangler local D1:

```powershell
npm run cf:dev
```

Then capture:

```powershell
Start-Process "http://127.0.0.1:8787/calendar?provider_name=travelpayouts&destination_iata=BKK"
Start-Process "http://127.0.0.1:8787/calendar?provider_name=travelpayouts_demo&destination_iata=BKK"
Start-Process "http://127.0.0.1:8787/api/price-calendar?provider_name=travelpayouts&destination_iata=BKK&include_expired=true"
Start-Process "http://127.0.0.1:8787/api/price-calendar?provider_name=travelpayouts_demo&destination_iata=BKK&include_expired=true"
```

Also capture the local D1 verification summary:

```powershell
npm run travelpayouts:import:verify:local
```

`npm run dev` is optional for the demo path, but it is not evidence that imported rows are being read from Wrangler local D1.

## Screenshot Checklist

- calendar page showing `Travelpayouts cached` and `Real cached data`
- calendar page showing `Demo data` and `Demo seed data`
- API JSON showing `provider_name=travelpayouts`, `is_live=false`, and `is_bookable_claim=false`
- API JSON showing `provider_name=travelpayouts_demo`, `is_live=false`, and `is_bookable_claim=false`
- visible cached/recheck warning text on every row
- no raw provider payload, request headers, local tokens, passenger data, payment data, booking state, order state, or ticketing state

## Honest Portfolio Caption

Phase 8E demonstrates local D1-backed separation between real provider-derived cached discovery rows and controlled demo seed rows. The Travelpayouts rows are cached/recently found data only. They are not live availability, not guaranteed bookable, not deployed to Cloudflare, and not used for booking, payment, ticketing, or passenger identity workflows.
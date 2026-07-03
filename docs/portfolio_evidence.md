# Portfolio Evidence Guide

This guide explains how to present Malaysia Flight Deal Radar honestly to reviewers. It separates the remote safe mock/demo deployment from local D1 evidence that contains imported Travelpayouts cached rows.

## What The Project Proves

- A deployed Cloudflare Worker can serve a dashboard, `/calendar`, health endpoints, JSON APIs, and protected admin routes.
- Cloudflare D1 stores normalized route, scan, fare, score, alert, provider-health, and price-calendar records.
- The scoring engine uses historical median and p10 baselines instead of a fixed cheap-price threshold.
- The provider registry keeps real providers disabled by default and reports safe readiness states.
- The price calendar separates controlled demo rows from locally imported Travelpayouts cached rows.
- Cached fare rows remain `is_live=false`, `is_bookable_claim=false`, and require recheck before purchase.

## Evidence Lanes

### 1. Remote Live Demo: Safe Mock/Demo Deployment

Use the remote Worker URL to show the deployed app works with controlled mock/demo evidence:

- `https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/dashboard`
- `https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/calendar`
- `/health`
- `/api/provider-health`
- `/api/deals`
- `/api/price-calendar`

This remote demo proves deployment, D1 connectivity, dashboard/API behavior, mock provider health, and safe disabled real-provider states. It does not contain real Travelpayouts imported rows.

### 2. Local D1 Evidence: Imported Travelpayouts Cached Rows

Use Cloudflare local dev so the Worker reads Wrangler local D1:

```powershell
npm run cf:dev
Start-Process "http://127.0.0.1:8787/calendar?provider_name=travelpayouts&destination_iata=BKK"
npm run travelpayouts:import:verify:local
```

Comparison URLs:

```powershell
Start-Process "http://127.0.0.1:8787/calendar?provider_name=travelpayouts_demo&destination_iata=BKK"
Start-Process "http://127.0.0.1:8787/api/price-calendar?provider_name=travelpayouts&destination_iata=BKK&include_expired=true"
Start-Process "http://127.0.0.1:8787/api/price-calendar?provider_name=travelpayouts_demo&destination_iata=BKK&include_expired=true"
```

`npm run dev` is optional for local demo path testing, but it is not evidence that imported rows are being read from Wrangler local D1.

## Screenshot Checklist

Capture these for a reviewer packet:

1. All providers view showing the price calendar provider dropdown and source badges.
2. Travelpayouts cached only local view showing `Travelpayouts cached`, `Real cached data`, `provider_name=travelpayouts`, `is_live=false`, and `is_bookable_claim=false`.
3. Demo data only view showing `Demo data`, `Demo seed data`, and `provider_name=travelpayouts_demo`.
4. API provider-filter response for `provider_name=travelpayouts` and `provider_name=travelpayouts_demo`.
5. `npm run travelpayouts:import:verify:local` result showing local D1 provider/freshness counts and top cached prices.
6. Provider readiness safe state showing mock healthy and real/cached providers disabled or dry-run protected.

## Safety Boundaries

- Travelpayouts remains disabled on Cloudflare.
- No Travelpayouts token is configured in Cloudflare or committed to the repository.
- Cached prices are recently found data, not live availability.
- No live fare, live coverage, or bookable inventory is claimed.
- The project does not create bookings, orders, payments, tickets, passenger identity records, or passport records.
- APIs, reports, screenshots, and docs must not expose raw provider payloads, request headers, tokens, or secret-shaped values.

## Honest Portfolio Caption

Malaysia Flight Deal Radar is a Cloudflare Worker and D1 flight-deal radar for Malaysia-origin routes. The remote demo uses controlled mock/demo data to prove deployment, dashboard/API behavior, scoring, and provider guardrails. Local D1 evidence proves Travelpayouts cached-row import and source separation, but those rows are cached discovery data only: not live, not guaranteed bookable, not deployed to Cloudflare, and not used for booking, payment, ticketing, or passenger identity workflows.

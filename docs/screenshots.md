# Screenshot Guide

Use screenshots as portfolio evidence only after you confirm whether you are capturing the remote mock/demo deployment or local D1 evidence. Do not mix the two in captions.

Do not commit screenshots unless they are intentionally reviewed and contain no secrets, private account IDs, token values, local shell history with credentials, passenger data, payment data, or raw provider payloads.

## Evidence Lanes

- Remote live demo: safe mock/demo deployment only. It proves the Worker, D1 connection, dashboard/API routes, mock provider health, and disabled real-provider state. It does not contain real Travelpayouts imported rows.
- Local D1 evidence: imported Travelpayouts cached rows verified through `npm run cf:dev` and Wrangler local D1. It is not deployed to Cloudflare and is not live/bookable inventory.

## Phase 8F Screenshot Checklist

1. All providers view
   - Run `npm run cf:dev`.
   - Capture `http://127.0.0.1:8787/calendar?destination_iata=BKK&include_expired=true`.
   - Show the provider dropdown and both source categories when local data exists.

2. Travelpayouts cached only view
   - Capture `http://127.0.0.1:8787/calendar?provider_name=travelpayouts&destination_iata=BKK`.
   - Show `Travelpayouts cached`, `Real cached data`, `provider_name=travelpayouts`, `is_live=false`, `is_bookable_claim=false`, and recheck warning text.

3. Demo data only view
   - Capture `http://127.0.0.1:8787/calendar?provider_name=travelpayouts_demo&destination_iata=BKK`.
   - Show `Demo data`, `Demo seed data`, and `provider_name=travelpayouts_demo`.

4. API provider filter response
   - Capture `http://127.0.0.1:8787/api/price-calendar?provider_name=travelpayouts&destination_iata=BKK&include_expired=true`.
   - Capture `http://127.0.0.1:8787/api/price-calendar?provider_name=travelpayouts_demo&destination_iata=BKK&include_expired=true`.
   - Confirm `is_live=false`, `is_bookable_claim=false`, and no raw payload fields.

5. Local D1 import verification
   - Capture:
     ```powershell
     npm run travelpayouts:import:verify:local
     ```
   - Show provider/freshness counts and top cached prices without exposing tokens or raw payloads.

6. Provider readiness safe state
   - Capture deployed `/api/provider-health` or local `/api/provider-health`.
   - Show mock healthy and real/cached providers disabled, dry-run protected, or blocked by missing credentials.
   - Confirm Travelpayouts remains disabled on Cloudflare.


## Phase 8I Dashboard Demo Screenshot Polish

Use the deployed `/dashboard` page for portfolio dashboard screenshots after the remote mock demo has been reset and scanned. The dashboard should clearly show varied mock/demo cards across routes, dates, stay lengths, prices, carriers, labels, and last verified timestamps.

Required visible evidence:

- Banner text: `Remote demo uses controlled mock data only. Prices are not live and must be rechecked.`
- Summary metrics: total demo cards, strong deals, suspected deals, stale/revalidate count, and mock provider status.
- At least one `strong_deal` and one `suspected_deal` card from controlled mock/demo data.
- Captions must say the remote dashboard uses controlled mock/demo data only, does not claim live fare coverage, and does not support booking, payment, ticket issuance, or passenger storage.

## Existing Deployment Screenshots

1. Dashboard with deal cards
   - URL: `https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/dashboard`
   - Capture at least one `strong_deal` and one `suspected_deal` from controlled mock/demo data.

2. Remote KUL Asia Price Calendar
   - URL: `https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/calendar`
   - Capture controlled demo rows and cached/recheck warning text.
   - Caption it as remote mock/demo evidence, not real Travelpayouts import evidence.

3. Deployment health report output
   - Command:
     ```powershell
     npm run cf:demo:report:remote -- --base-url "https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev"
     ```
   - Capture health status, provider readiness, deal counts, and top strong/suspected rows.

4. Tests passing
   - Capture:
     ```powershell
     npm run typecheck --if-present
     npm test --if-present
     npm run cf:check
     ```

## Suggested Portfolio Sequence

1. Start with the deployed dashboard screenshot.
2. Add provider-health JSON proving real providers are disabled.
3. Add local D1 Travelpayouts evidence through `npm run cf:dev`.
4. Add API filter screenshots showing `travelpayouts` vs `travelpayouts_demo`.
5. Add tests passing.
6. Caption clearly: remote demo is controlled mock/demo; local D1 evidence shows cached Travelpayouts rows that are not live and not bookable.

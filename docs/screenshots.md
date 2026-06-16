# Screenshot Guide

Use screenshots as portfolio evidence after the deployed demo has been reset, seeded, scanned, and verified.

Do not commit screenshots unless they are intentionally reviewed and contain only mock/demo data. Avoid screenshots that show local shell history with secrets, account IDs, private Cloudflare settings, or unredacted tokens.

## Recommended Screenshots

1. Dashboard with deal cards
   - URL: `https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/dashboard`
   - Capture at least one `strong_deal` and one `suspected_deal`.
   - Include visible price, baseline median, discount, provider, and last verified fields.

2. KUL Asia Price Calendar
   - URL: `https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev/calendar`
   - Capture cached fare rows sorted by RM price.
   - Include visible warning text: cached fare, recheck before purchase, not guaranteed live.

3. `/health` JSON
   - Shows Worker health status.
   - Confirms the deployed Worker responds.

4. `/api/provider-health` JSON
   - Shows `mock` healthy/available.
   - Shows real providers disabled.
   - Confirm no credential values appear.

5. `/api/deals` JSON
   - Shows normalized deal records.
   - Capture deal-label counts or sample records.
   - Do not expose raw provider payloads.

6. `/api/price-calendar` JSON
   - Shows normalized calendar rows.
   - Confirm `is_live=false` and `is_bookable_claim=false`.
   - Do not expose raw provider payloads.

7. Deployment health report output
   - Command:
     ```powershell
     npm run cf:demo:report:remote -- --base-url "https://malaysia-flight-deal-radar-demo.spaceleoch-flight-radar.workers.dev"
     ```
   - Capture health status, provider readiness, deal counts, and top strong/suspected rows.

8. Tests passing
   - Capture:
     ```powershell
     npm run typecheck --if-present
     npm test --if-present
     npm run cf:check
     ```

9. Cloudflare Worker URL
   - Capture the public dashboard URL or browser address bar.
   - Do not capture private account settings, tokens, or secret configuration screens.

## Suggested Portfolio Sequence

1. Start with the dashboard screenshot.
2. Add the deployment health report.
3. Add provider-health JSON proving real providers are disabled.
4. Add tests passing.
5. Add a short caption explaining that the online demo uses controlled mock fare data and real-provider activation is intentionally gated.

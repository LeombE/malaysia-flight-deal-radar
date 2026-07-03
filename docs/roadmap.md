# Roadmap

This roadmap keeps the project honest: the current online demo uses controlled mock fare data and a cached price-calendar demo. Real-provider activation requires explicit access, retention, rate-limit, display, and revalidation checks.

## Phase 8B: Travelpayouts Cached Fare Calendar

- Add Travelpayouts / Aviasales Data API as a cached fare provider.
- Build `/api/price-calendar` and `/calendar` for KUL Asia routes.
- Treat rows as cached/recently found fares, not live/bookable offers.
- Keep provider disabled and dry-run protected by default.
- Seed controlled demo rows for Southeast Asia, Taiwan, Japan, and China.

## Phase 8C: Safe Local Travelpayouts Smoke Tooling

- Add local readiness and one-request smoke commands.
- Keep cached provider disabled and dry-run protected by default.
- Verify endpoint request shapes with mocked tests.
- Never configure the cached provider on Cloudflare in this phase.

## Phase 8D: Local Travelpayouts Import Into Local D1

- Import low-limit Travelpayouts cached rows into Wrangler local D1 only.
- Upsert normalized `price_calendar_rows` without raw provider payloads.
- Keep imported rows marked `is_live=false` and `is_bookable_claim=false`.
- Verify imported rows through Cloudflare Worker local dev.

## Phase 8E: Real Cached Data vs Demo Data Separation

- Add provider filtering for `travelpayouts` and `travelpayouts_demo`.
- Show visible source badges for real cached import rows and demo seed rows.
- Keep cached/recheck warnings visible on every row.
- Keep imported local D1 evidence separate from deployed mock/demo evidence.

## Phase 8F: Skyscanner Access Preparation

- Confirm official partner/API access path.
- Document allowed search, display, retention, cache, and deep-link rules.
- Define rate-limit and daily-budget defaults.
- Design request/response schemas before implementation.
- Do not implement until access and terms are confirmed.

## Phase 8G: Real Provider Activation Checklist

- Confirm provider terms and allowed retention behavior.
- Confirm MYR support or conversion policy.
- Confirm revalidation workflow.
- Confirm display/deep-link rules.
- Confirm rate limits and retry/backoff policy.
- Confirm production budgets and kill switches.
- Confirm dashboard warnings for stale/expired offers.
- Confirm no raw provider payload persistence unless explicitly allowed.

## Phase 9: Limited Live Provider Dry Run

- Enable one provider in a controlled environment only.
- Use tiny search budget and dry-run-first verification.
- Run a single-route smoke test.
- Verify provider-health readiness and budget accounting.
- Verify no secrets appear in logs, APIs, reports, screenshots, or committed files.
- Keep booking/order/payment/ticketing out of scope.

## Phase 10: Production Monitoring

- Add deployed health snapshots on a schedule.
- Track provider failure counts and rate-limit states.
- Track scan job success/failure by provider.
- Monitor stale/expired offer rates.
- Add alert delivery observability.
- Add rollback runbooks for provider disablement.

## Phase 11: GitHub Actions / Scheduled Report

- Add CI for typecheck/tests.
- Add optional scheduled read-only deployment report.
- Store reports as sanitized artifacts, not committed secrets.
- Add documentation lint or secret-pattern checks.
- Keep real network calls out of unit tests.

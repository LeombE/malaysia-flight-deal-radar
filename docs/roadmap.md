# Roadmap

This roadmap keeps the project honest: the current online demo uses controlled mock fare data and a cached price-calendar demo. Real-provider activation requires explicit access, retention, rate-limit, display, and revalidation checks.

## Phase 8B: Travelpayouts Cached Fare Calendar

- Add Travelpayouts / Aviasales Data API as a cached fare provider.
- Build `/api/price-calendar` and `/calendar` for KUL Asia routes.
- Treat rows as cached/recently found fares, not live/bookable offers.
- Keep provider disabled and dry-run protected by default.
- Seed controlled demo rows for Southeast Asia, Taiwan, Japan, and China.

## Phase 8C: Telegram On Cloudflare

- Configure Telegram delivery in Cloudflare secret storage.
- Keep dry-run or low-volume mode until message formatting is verified.
- Verify duplicate alert cooldown in deployed D1.
- Confirm no stale or expired offers can alert.
- Capture sanitized alert evidence without exposing tokens or chat identifiers.

## Phase 8D: Skyscanner Access Preparation

- Confirm official partner/API access path.
- Document allowed search, display, retention, cache, and deep-link rules.
- Define rate-limit and daily-budget defaults.
- Design request/response schemas before implementation.
- Do not implement until access and terms are confirmed.

## Phase 8E: Real Provider Activation Checklist

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

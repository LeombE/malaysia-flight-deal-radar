# Provider Compliance

## Global Rules

- Use official, partner, or explicitly authorized APIs only.
- Do not scrape Google Flights, airlines, OTAs, login-protected pages, or CAPTCHA-protected pages.
- Keep API keys server-side in environment variables.
- Default provider retention mode is `NO_CACHE`.
- Do not persist raw provider payloads unless an explicit provider agreement allows it.
- Never display stale cached provider results as live fares.
- Always revalidate a fare before alerting or displaying provider-derived live fare content.
- Suspected deals are statistical signals only. Do not call them confirmed airline promotions unless the provider explicitly returns promotion or campaign data.
- Historical snapshots are baseline inputs, not live fares. Dashboard and alert copy must make freshness visible.
- JSON API and dashboard responses must expose only normalized fare summaries, scores, and provider health. Do not expose API keys, Telegram credentials, admin tokens, OAuth tokens, raw provider payloads, or revalidation payloads.
- Dashboard deal cards may show stale or expired records only with explicit warning state. They must not label cached fares as live.
- Batch scanning must respect provider daily budgets, concurrency limits, retry guidance, and disabled-provider states.
- Phase 3 scheduler tests use MockProvider only. Optional real providers, including Amadeus, must be skipped when credentials are absent and must not be expanded during scheduler work.
- Phase 5 API and dashboard tests use MockProvider or injected test providers only. They must not make real network calls.
- Real providers must remain disabled by default. Live search is blocked unless `ENABLE_REAL_PROVIDERS=true`, `REAL_PROVIDER_DRY_RUN=false`, required credentials exist, a default provider is selected, and budget/retention/revalidation checks pass.
- Cached fare providers must also remain disabled by default. Cached search is blocked unless cached-provider guardrails are explicitly opened and credentials are configured.
- Provider readiness output may show boolean credential status and blocking reason codes, but never secret values, raw credentials, OAuth tokens, or provider payloads.
- Telegram alerts must be sent only for fresh, revalidated, non-expired fares. Alert messages are normalized summaries, not raw provider payloads.
- Telegram delivery errors must be sanitized and must never include bot tokens.
- The radar is not a booking engine. Do not create orders, collect passenger identity, store passports, process payments, ticket flights, or implement checkout without a separate approved phase.
- Future providers must complete `docs/real_provider_activation_checklist.md` before adapter implementation or enablement.

## Amadeus

Amadeus is an optional fallback provider. It must remain disabled unless both `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` are configured.

The adapter uses OAuth client credentials and keeps access tokens in memory only. Tokens, client IDs, and client secrets must not be logged or persisted.

Flight Offers Search can be incomplete for Malaysia deal-radar purposes. Amadeus documentation warns that low-cost carriers and some major carriers are unavailable in Flight Offers Search, so Amadeus must not be treated as complete market coverage.

Cached or inspiration-style Amadeus APIs are not live fares and must not be shown as live. This adapter uses Flight Offers Search for search and Flight Offers Price for revalidation before alert or display.

Production use requires verified Amadeus access terms, rate limits, and allowed retention behavior.

## Duffel

Duffel is implemented as a Phase 6B adapter for offer-search validation. It is disabled unless `ENABLE_REAL_PROVIDERS=true`, `REAL_PROVIDER_DRY_RUN=false`, `DEFAULT_REAL_PROVIDER=duffel`, `DUFFEL_ACCESS_TOKEN` is configured, budget remains available, and readiness checks pass.

Tokens beginning with `duffel_test_` are treated as test/sandbox mode and reported only as a boolean. Never log or return the token value.

The adapter may create offer requests and retrieve offers for revalidation. It must not create orders, book flights, collect passenger names or passport data, process payments, ticket flights, or provide checkout.

Duffel offers are short-lived. Search results are not display/alert eligible until revalidated with offer retrieval. Expired offers are rejected, and stale cached Duffel fares must not be shown as live.

Default retention mode is `NO_CACHE`. Persist normalized summaries only: route, dates, MYR minor-unit amount, baseline/scoring fields, carrier, stops, duration, expiry, and verification timestamps. Do not persist raw Duffel payloads by default.

Production use requires verified Duffel access terms, display rules, retention behavior, rate limits, and sandbox-to-live promotion controls.

## Travelpayouts / Aviasales Data API

Travelpayouts is implemented as a cached/recently found fare data provider for the KUL Asia Price Calendar. It is disabled unless cached-provider flags are explicitly enabled, dry-run is disabled, the selected cached provider is Travelpayouts, and a token is configured server-side.

Travelpayouts Data API rows must be treated as cached data, not live fares. The UI and API must set `is_live=false`, `is_bookable_claim=false`, and show warnings such as "Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed."

Default retention mode is `AGGREGATE_ONLY` or `NO_CACHE`. Persist normalized calendar fields only: route, dates, MYR minor-unit amount when available, original currency/amount, airline, stops, provider, endpoint, retrieved timestamp, expiry, freshness label, safe search link, and warning. Do not persist raw Travelpayouts payloads.

If the API returns a link, store it only as a search/recheck link. If a generic search link is generated, label it clearly and do not claim it preserves the exact fare.

This provider is acceptable for a low-budget MVP because it supports discovery and price-calendar browsing without scraping. It is not acceptable for confirmed availability, booking claims, or alerting as a live fare without a separate recheck step.

Amadeus may later supplement limited live checks, but its low-cost-carrier coverage can be incomplete. Duffel is better suited to controlled offer validation than free broad fare scanning. Skyscanner remains a future partner candidate pending access, terms, retention, rate-limit, and display-rights verification.

## Skyscanner

Skyscanner is documentation-only in Phase 8G. No adapter, credential, Cloudflare secret, smoke command, provider registry entry, or readiness entry is added.

Do not call Skyscanner APIs or consumer pages until official partner/API access and terms are confirmed. Do not scrape Skyscanner pages, browser-rendered results, login-protected pages, unofficial endpoints, or CAPTCHA-protected pages.

Before implementation, confirm allowed search scope, Malaysia market support, MYR behavior, display rules, attribution, cache/retention limits, deep-link semantics, rate limits, retry rules, public screenshot/portfolio language, and whether a revalidation or freshness model exists.

Default retention remains `NO_CACHE`. If only search or deep-link handoff is available, Skyscanner-derived content must be labeled as recheck handoff data, not guaranteed live fare or bookable inventory.

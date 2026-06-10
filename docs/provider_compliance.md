# Provider Compliance

## Global Rules

- Use official, partner, or explicitly authorized APIs only.
- Do not scrape Google Flights, airlines, OTAs, login-protected pages, or CAPTCHA-protected pages.
- Keep API keys server-side in environment variables.
- Default provider retention mode is `NO_CACHE`.
- Do not persist raw provider payloads unless an explicit provider agreement allows it.
- Never display stale cached provider results as live fares.
- Always revalidate a fare before alerting or displaying provider-derived live fare content.

## Amadeus

Amadeus is an optional fallback provider. It must remain disabled unless both `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` are configured.

The adapter uses OAuth client credentials and keeps access tokens in memory only. Tokens, client IDs, and client secrets must not be logged or persisted.

Flight Offers Search can be incomplete for Malaysia deal-radar purposes. Amadeus documentation warns that low-cost carriers and some major carriers are unavailable in Flight Offers Search, so Amadeus must not be treated as complete market coverage.

Cached or inspiration-style Amadeus APIs are not live fares and must not be shown as live. This adapter uses Flight Offers Search for search and Flight Offers Price for revalidation before alert or display.

Production use requires verified Amadeus access terms, rate limits, and allowed retention behavior.


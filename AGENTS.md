# Malaysia Flight Deal Radar Rules

- Build for Malaysia-based travelers using origins JHB, KUL, and optionally SZB.
- MVP searches round-trip, economy-cabin, one-adult fares only.
- Display prices in MYR/RM using integer minor units internally.
- This is not a booking engine. Do not implement checkout, payment, ticket issuance, passport handling, or passenger identity storage.
- Do not scrape Google Flights, airline websites, OTA websites, login-protected pages, or CAPTCHA-protected pages.
- Use only official, partner, or explicitly authorized APIs.
- Default provider retention mode is NO_CACHE unless a verified agreement explicitly allows more.
- Never display stale cached provider results as live fares.
- Always revalidate a provider offer before alerting or before showing provider-derived display/deep-link content.
- Do not label a fare as a confirmed promotion unless the provider explicitly returns promotion or campaign data.
- Never hard-code API keys or secrets. Use environment variables and example env files only.
- Keep tests deterministic and mock external HTTP calls.


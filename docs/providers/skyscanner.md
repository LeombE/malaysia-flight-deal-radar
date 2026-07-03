# Skyscanner Provider Access Preparation

Skyscanner is a future partner/API candidate for Malaysia Flight Deal Radar. It is not implemented, not configured, and not enabled in this repository.

Phase 8G is documentation-only. It prepares the questions and acceptance gates required before any adapter code, credential configuration, smoke command, Cloudflare secret, or live request is added.

## Current Status

- No Skyscanner adapter exists.
- No Skyscanner credential name, token, or secret value is committed.
- No Skyscanner API call is made by local tests, scripts, Cloudflare checks, scheduler runs, or demo routes.
- No Skyscanner data is shown in the dashboard, `/api/deals`, `/api/price-calendar`, `/calendar`, or `/api/provider-health`.
- Skyscanner remains deferred until official access and terms are confirmed.

## Access Path To Confirm

Before implementation, confirm the official partner/API path directly from Skyscanner or an explicitly authorized partner channel:

- account approval and intended use case are accepted
- product/API surface is available for fare search or deep-link handoff
- Malaysia-origin routes are allowed, including `JHB`, `KUL`, and optionally `SZB`
- round-trip economy, one-adult searches are supported
- MYR display is supported, or a provider-approved conversion/display policy exists
- terms allow the project to present normalized fare summaries in a deal-radar UI

Do not use scraping, browser automation against consumer pages, reverse-engineered endpoints, unofficial API mirrors, login-protected pages, or CAPTCHA-protected pages.

## Terms To Verify

Document written confirmation for:

- allowed search parameters and market/country settings
- rate limits, burst limits, concurrency limits, and retry guidance
- daily budget or quota limits for development and production
- cache and retention rules for search results, price values, itinerary metadata, and deep links
- display rules for price freshness, provider attribution, carrier names, taxes/fees, baggage notes, and caveats
- whether deep links are exact-offer links, search-result links, or generic recheck links
- whether raw payload persistence is allowed; default remains `NO_CACHE`
- whether a revalidation or pricing confirmation endpoint exists before alert/display eligibility
- required user-facing warnings for stale, expired, cached, or third-party results
- rules for screenshots, portfolio evidence, and public demo presentation

If any item is unclear, the provider stays unimplemented.

## Candidate Request Scope

The only candidate search shape for a future adapter is:

- origin: `JHB`, `KUL`, or optionally `SZB`
- destination: approved Asia destination IATA code
- trip type: round trip
- cabin: economy
- passengers: one adult
- currency: MYR when supported
- dates: explicit outbound and return dates
- max results: low, provider-approved limit

Do not include passenger names, identity documents, passport data, payment details, loyalty accounts, checkout information, or contact information.

## Candidate Normalized Output

If approved later, normalized output should contain only fields needed by the existing scoring and display model:

- provider name and provider offer/reference ID when allowed
- route, outbound date, and return date
- amount in integer MYR minor units when MYR is supported
- original currency and amount when MYR is not directly supported
- carrier summary, stops, and duration when allowed
- retrieved timestamp, expiry or freshness window when available
- revalidation timestamp when a revalidation step exists
- safe provider/deep-link URL only when terms allow display
- warning text that distinguishes live, cached, stale, and recheck-only data

Do not persist raw provider payloads by default.

## Revalidation And Display Gate

Skyscanner-derived content must not be alert/display eligible unless the future approved API supports a reliable freshness or revalidation workflow. If only search or deep-link discovery is available, the UI must label it as a recheck handoff, not a confirmed live fare.

The following statements are prohibited unless explicitly supported by provider terms and revalidation evidence:

- confirmed promotion
- guaranteed live fare
- bookable inventory
- exact fare still available
- ticket can be issued by this project

## Proposed Safety Defaults

Future implementation must start disabled and dry-run protected:

- real-provider activation remains off by default
- default provider remains empty unless explicitly selected
- default retention remains `NO_CACHE`
- initial search budget is one route per controlled run
- tests must mock HTTP responses
- provider readiness may report boolean status and blocker reason codes only

Do not add environment variable names, Cloudflare secrets, API credentials, or adapter code until the real provider activation checklist is complete.

## Implementation Exit Criteria

Implementation can begin only after `docs/real_provider_activation_checklist.md` is complete for Skyscanner and explicitly records:

- approved access path
- allowed search and display scope
- retention/cache rules
- revalidation or freshness model
- rate-limit and retry policy
- budget and kill-switch defaults
- secret-management destination
- mock-only test strategy
- reviewer-safe public documentation language
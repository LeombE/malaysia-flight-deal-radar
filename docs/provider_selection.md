# Provider Selection Notes

Phase 6A recorded selection criteria and guardrails. Phase 6B implements Duffel first in sandbox/test-mode style to validate the adapter path without adding booking flows. Phase 8B adds Travelpayouts as a cached/recently found fare source for the price calendar. Phase 8G keeps Skyscanner as access-preparation only.

## Candidates

Skyscanner is a metasearch/deep-link style candidate. It may be useful for broad fare discovery and user handoff, but official access, live display, cache retention, revalidation/freshness, rate-limit, and deep-link rules must be checked against partner terms before implementation. See `docs/providers/skyscanner.md`.

Duffel is the first implemented validation adapter because it provides structured offers and expiry semantics that are useful for testing normalization, short-lived fare handling, and revalidation. The project still uses Duffel only for offer search and offer retrieval. It does not create orders, book flights, collect passenger identity, process payments, ticket flights, or provide checkout.

Amadeus already exists as an optional fallback scaffold. It should remain fallback only because Flight Offers Search may have incomplete low-cost carrier and market coverage for Malaysia-based deal discovery.

Travelpayouts / Aviasales Data API is the current low-budget cached fare discovery path. It is useful for calendar browsing and local evidence, but it is not a live availability provider and must not be used for bookable claims or live alerts without a separate recheck path.

## Integration Rule

Integrate one real provider at a time. Before coding an adapter, confirm:

- partner account/access approval
- official API docs and terms
- live fare display and retention permissions
- whether raw payload storage is allowed
- MYR support
- revalidation/pricing confirmation support
- daily budget, concurrency, retry, and rate-limit rules
- required attribution or warning text
- provider-specific activation checklist completion

Tests must mock HTTP and must not make real network calls.

## Current Provider Status

- `mock`: default local/demo provider and test provider.
- `travelpayouts`: cached fare data provider for local price-calendar evidence, disabled on Cloudflare.
- `amadeus`: optional fallback scaffold only.
- `duffel`: Phase 6B adapter, disabled by default, test-token aware, `NO_CACHE` by default.
- `skyscanner`: not implemented, not configured, access-preparation documentation only.

## Activation Rule

No provider should move from candidate or disabled status into live search until `docs/real_provider_activation_checklist.md` is complete for that provider. The checklist must confirm official access, allowed scope, retention, rate limits, display/deep-link rules, revalidation or freshness semantics, secret handling, rollback values, and mock-only test coverage.

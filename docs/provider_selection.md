# Provider Selection Notes

Phase 6A recorded selection criteria and guardrails. Phase 6B implements Duffel first in sandbox/test-mode style to validate the adapter path without adding booking flows. Skyscanner remains deferred.

## Candidates

Skyscanner is a metasearch/deep-link style candidate. It may be useful for broad fare discovery and user handoff, but live display, cache retention, and deep-link rules must be checked against partner terms before implementation.

Duffel is the first implemented validation adapter because it provides structured offers and expiry semantics that are useful for testing normalization, short-lived fare handling, and revalidation. The project still uses Duffel only for offer search and offer retrieval. It does not create orders, book flights, collect passenger identity, process payments, ticket flights, or provide checkout.

Skyscanner remains deferred until partner API access, live fare display rights, cache retention rules, and deep-link rules are confirmed.

Amadeus already exists as an optional fallback scaffold. It should remain fallback only because Flight Offers Search may have incomplete low-cost carrier and market coverage for Malaysia-based deal discovery.

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

Tests must mock HTTP and must not make real network calls.

## Current Provider Status

- `mock`: default local/demo provider and test provider.
- `amadeus`: optional fallback scaffold only.
- `duffel`: Phase 6B adapter, disabled by default, test-token aware, `NO_CACHE` by default.
- `skyscanner`: not implemented yet.

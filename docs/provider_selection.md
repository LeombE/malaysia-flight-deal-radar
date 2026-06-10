# Provider Selection Notes

Phase 6A does not implement a new provider. It records selection criteria for Phase 6B.

## Candidates

Skyscanner is a metasearch/deep-link style candidate. It may be useful for broad fare discovery and user handoff, but live display, cache retention, and deep-link rules must be checked against partner terms before implementation.

Duffel is a bookable-offer style candidate. It may provide structured offers and expiry semantics, but production use needs confirmed access, fare display rules, order/ticketing boundaries, and short-lived offer handling.

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

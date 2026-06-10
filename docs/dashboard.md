# Dashboard

The dashboard is available at `GET /` and `GET /dashboard`.

It is intentionally minimal in Phase 5: server-rendered HTML backed by the same normalized API repository used by JSON routes. It is suitable for local inspection and simple Cloudflare Worker deployment without adding a frontend build step.

## Filters

The page renders filters for:

- origin: `JHB`, `KUL`, `SZB`
- region group
- country
- destination airport
- departure date range
- stay length

Deal cards are sorted by score by the API repository. Cards show route, dates, stay length, RM price, baseline, discount, stops, carrier, provider, and last verified time.

## Freshness

Stale fares cannot be shown as live because search results and cached snapshots can age out quickly. A dashboard card can show stale or expired data only as context, with an explicit warning and `Needs revalidation` state.

Fresh display depends on recent provider revalidation, a non-expired offer, and provider retention/display permission. Live-only clients should call `/api/deals?only_recently_verified=true`.

## Provider Scope

Dashboard tests use `MockProvider` or injected test providers. No real network calls are made. Amadeus may appear in provider health as disabled when credentials are missing, but Phase 5 does not expand it and does not add Skyscanner, Duffel, or another real provider.

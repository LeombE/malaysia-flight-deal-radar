# JSON API

Phase 5 exposes a small Cloudflare Worker API for health checks, dashboard data, and controlled admin actions. Phase 8B adds a cached price-calendar API. Responses are JSON unless an HTML dashboard/calendar route is requested.

## Public Endpoints

- `GET /health`: Worker and provider status summary.
- `GET /api/origins`: active origin airports.
- `GET /api/destinations`: active destination airports.
- `GET /api/deals`: normalized scored deals.
- `GET /api/price-history`: normalized historical price snapshots.
- `GET /api/price-calendar`: cached/recently found fare calendar rows.
- `GET /api/provider-health`: provider registry and persisted provider-limit health.

Supported deal filters include:

- `origin_iata` or `origin`
- `destination_iata` or `destination`
- `country_code` or `country`
- `region_group` or `region`
- `departure_from`
- `departure_to`
- `stay_length_days` or `stay_length`
- `min_score`
- `max_stops`
- `provider_name` or `provider`
- `only_alert_eligible`
- `only_recently_verified`

Use `only_recently_verified=true` when the client needs live-display-safe deals. Without it, stale or expired records may be returned for historical context, but each record includes `is_live` and `warning`.

Supported price-calendar filters include:

- `origin_iata` or `origin`
- `destination_iata` or `destination`
- `destination_region` or `region`
- `destination_country` or `country`
- `provider_name` or `provider`
- `departure_from`
- `departure_to`
- `stay_length_days` or `stay_length`
- `cabin_class`
- `adults`
- `max_stops`
- `freshness`
- `include_expired`
- `sort_by`
- `sort_order`

Price-calendar rows are cached discovery records. They return `is_live=false`, `is_bookable_claim=false`, and warning text by design. Use `provider_name=travelpayouts` for locally imported Travelpayouts cached rows and `provider_name=travelpayouts_demo` for controlled demo seed rows.

## Admin Endpoints

- `POST /api/admin/scan`: runs the same scan runner used by cron.
- `POST /api/admin/revalidate`: authenticated safe stub in Phase 5.

Admin endpoints require:

```http
Authorization: Bearer <ADMIN_TOKEN>
```

If `ADMIN_TOKEN` is not configured, admin endpoints return disabled responses. Wrong tokens return unauthorized responses.

## Retention And Secrets

API responses must not include raw provider payloads, provider API keys, Telegram credentials, OAuth tokens, admin tokens, or revalidation payloads. `NO_CACHE` providers remain normalized-only; the API reads from fare checks, snapshots, scores, alerts, and provider limit summaries.

Amadeus remains optional and disabled unless credentials are present. The provider-health endpoint may show it as disabled; that is expected and must not break the dashboard.

Travelpayouts may appear as a disabled cached provider. It is separate from live provider readiness and must not be treated as confirmed bookable fare coverage.

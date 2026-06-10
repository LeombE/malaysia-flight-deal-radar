# JSON API

Phase 5 exposes a small Cloudflare Worker API for health checks, dashboard data, and controlled admin actions. Responses are JSON unless the dashboard HTML route is requested.

## Public Endpoints

- `GET /health`: Worker and provider status summary.
- `GET /api/origins`: active origin airports.
- `GET /api/destinations`: active destination airports.
- `GET /api/deals`: normalized scored deals.
- `GET /api/price-history`: normalized historical price snapshots.
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

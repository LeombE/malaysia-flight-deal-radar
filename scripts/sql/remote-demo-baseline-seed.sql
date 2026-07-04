-- Remote mock/demo baseline seed for Cloudflare D1.
-- Safe to rerun: it deletes only deterministic mock demo seed rows by ID prefix.
-- This file stores aggregate historical fare snapshots only. No raw provider payloads or secrets.

DELETE FROM fare_snapshots
WHERE provider = 'mock'
  AND id LIKE 'remote-demo-baseline-%';

DELETE FROM watchlist
WHERE id LIKE 'remote-demo-watchlist-%';

INSERT OR REPLACE INTO provider_limits (
  provider,
  retention_mode,
  daily_budget,
  used_today,
  concurrency_limit,
  min_request_interval_ms,
  health_status,
  failure_count,
  last_success_at,
  last_failure_at,
  updated_at
) VALUES (
  'mock',
  'RAW_ALLOWED',
  50,
  0,
  2,
  0,
  'healthy',
  0,
  NULL,
  NULL,
  '2026-06-10T08:00:00.000Z'
)
ON CONFLICT(provider) DO UPDATE SET
  retention_mode = excluded.retention_mode,
  daily_budget = excluded.daily_budget,
  used_today = 0,
  concurrency_limit = excluded.concurrency_limit,
  min_request_interval_ms = excluded.min_request_interval_ms,
  health_status = excluded.health_status,
  failure_count = 0,
  last_failure_at = NULL,
  updated_at = excluded.updated_at;

INSERT INTO watchlist (
  id,
  origin_iata,
  destination_iata,
  departure_date,
  return_date,
  stay_length_days,
  max_amount_minor_myr,
  active,
  created_at,
  updated_at
) VALUES
  ('remote-demo-watchlist-kul-bkk', 'KUL', 'BKK', '2026-07-25', '2026-07-30', 5, NULL, 1, '2026-06-10T08:00:00.000Z', '2026-06-10T08:00:00.000Z'),
  ('remote-demo-watchlist-kul-tpe', 'KUL', 'TPE', '2026-08-02', '2026-08-08', 6, NULL, 1, '2026-06-10T08:00:00.000Z', '2026-06-10T08:00:00.000Z'),
  ('remote-demo-watchlist-kul-sin', 'KUL', 'SIN', '2026-08-09', '2026-08-12', 3, NULL, 1, '2026-06-10T08:00:00.000Z', '2026-06-10T08:00:00.000Z'),
  ('remote-demo-watchlist-jhb-bkk', 'JHB', 'BKK', '2026-08-16', '2026-08-22', 6, NULL, 1, '2026-06-10T08:00:00.000Z', '2026-06-10T08:00:00.000Z'),
  ('remote-demo-watchlist-szb-nrt', 'SZB', 'NRT', '2026-09-03', '2026-09-10', 7, NULL, 1, '2026-06-10T08:00:00.000Z', '2026-06-10T08:00:00.000Z');

WITH
  demo_routes(origin_iata, destination_iata, departure_date, return_date, stay_length_days, low_amount_minor_myr, median_amount_minor_myr) AS (
    VALUES
      ('KUL', 'BKK', '2026-07-25', '2026-07-30', 5, 50000, 63000),
      ('KUL', 'TPE', '2026-08-02', '2026-08-08', 6, 43000, 60000),
      ('KUL', 'SIN', '2026-08-09', '2026-08-12', 3, 36000, 43000),
      ('JHB', 'BKK', '2026-08-16', '2026-08-22', 6, 41000, 57000),
      ('SZB', 'NRT', '2026-09-03', '2026-09-10', 7, 60000, 76000)
  ),
  samples(sample_index) AS (
    VALUES
      (1), (2), (3), (4), (5),
      (6), (7), (8), (9), (10),
      (11), (12), (13), (14), (15),
      (16), (17), (18), (19), (20)
  )
INSERT INTO fare_snapshots (
  id,
  provider,
  origin_iata,
  destination_iata,
  departure_date,
  return_date,
  stay_length_days,
  cabin_class,
  amount_minor_myr,
  observed_at,
  retention_mode
)
SELECT
  'remote-demo-baseline-' || lower(demo_routes.origin_iata) || '-' || lower(demo_routes.destination_iata) || '-' || printf('%02d', samples.sample_index),
  'mock',
  demo_routes.origin_iata,
  demo_routes.destination_iata,
  demo_routes.departure_date,
  demo_routes.return_date,
  demo_routes.stay_length_days,
  'economy',
  CASE
    WHEN samples.sample_index <= 2 THEN demo_routes.low_amount_minor_myr
    ELSE demo_routes.median_amount_minor_myr
  END,
  strftime('%Y-%m-%dT%H:%M:%SZ', '2026-06-10 08:00:00', '-' || samples.sample_index || ' days'),
  'AGGREGATE_ONLY'
FROM demo_routes
CROSS JOIN samples;

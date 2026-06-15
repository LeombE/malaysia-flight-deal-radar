-- Read-only verification for the remote mock/demo baseline seed.

SELECT
  origin_iata,
  destination_iata,
  COUNT(*) AS sample_count,
  MIN(amount_minor_myr) AS min_amount_minor_myr,
  MAX(amount_minor_myr) AS max_amount_minor_myr
FROM fare_snapshots
WHERE provider = 'mock'
  AND id LIKE 'remote-demo-baseline-%'
GROUP BY origin_iata, destination_iata
ORDER BY origin_iata, destination_iata;

SELECT
  id,
  origin_iata,
  destination_iata,
  departure_date,
  return_date,
  stay_length_days,
  active
FROM watchlist
WHERE id LIKE 'remote-demo-watchlist-%'
ORDER BY id;

SELECT
  provider,
  retention_mode,
  daily_budget,
  used_today,
  concurrency_limit,
  health_status,
  failure_count
FROM provider_limits
WHERE provider = 'mock';


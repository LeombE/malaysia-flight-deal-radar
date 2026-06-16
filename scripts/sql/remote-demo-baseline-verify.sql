-- Read-only verification for the remote mock/demo baseline seed.

WITH
  expected(label, expected_min_count) AS (
    VALUES
      ('strong_deal', 2),
      ('suspected_deal', 2),
      ('no_deal', 1)
  ),
  observed AS (
    SELECT
      ds.deal_label,
      COUNT(*) AS observed_count
    FROM deal_scores ds
    JOIN fare_checks fc ON fc.id = ds.fare_check_id
    WHERE fc.provider = 'mock'
    GROUP BY ds.deal_label
  )
SELECT
  expected.label AS deal_label,
  expected.expected_min_count,
  COALESCE(observed.observed_count, 0) AS observed_count,
  CASE
    WHEN COALESCE(observed.observed_count, 0) >= expected.expected_min_count THEN 'ok'
    ELSE 'missing'
  END AS status
FROM expected
LEFT JOIN observed ON observed.deal_label = expected.label
ORDER BY expected.label;

SELECT
  provider AS provider_name,
  COUNT(*) AS fare_check_count
FROM fare_checks
GROUP BY provider
ORDER BY provider;

SELECT
  provider AS provider_name,
  MAX(last_revalidated_at) AS latest_revalidated_at
FROM fare_checks
WHERE provider = 'mock'
GROUP BY provider;

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

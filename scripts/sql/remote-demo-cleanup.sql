-- Remote mock/demo cleanup for Cloudflare D1.
-- Safe scope: mock provider scan artifacts and explicitly tagged remote demo seed rows only.
-- This does not delete real provider rows, non-mock provider rows, or user-created watchlist rows.
-- Cloudflare D1 remote execute rejects SQL transaction control statements.
-- Keep each statement independently safe and idempotent.

DELETE FROM alerts
WHERE provider = 'mock'
   OR provider_name = 'mock'
   OR deal_score_id IN (
     SELECT ds.id
     FROM deal_scores ds
     JOIN fare_checks fc ON fc.id = ds.fare_check_id
     WHERE fc.provider = 'mock'
   );

DELETE FROM deal_scores
WHERE fare_check_id IN (
  SELECT id
  FROM fare_checks
  WHERE provider = 'mock'
);

DELETE FROM fare_checks
WHERE provider = 'mock';

DELETE FROM fare_snapshots
WHERE provider = 'mock';

DELETE FROM search_jobs
WHERE provider = 'mock'
   OR provider_name = 'mock';

DELETE FROM watchlist
WHERE id LIKE 'remote-demo-watchlist-%';

UPDATE provider_limits
SET used_today = 0,
    health_status = 'healthy',
    failure_count = 0,
    last_failure_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE provider = 'mock';

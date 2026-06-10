-- Add scheduler lifecycle fields without rewriting the committed initial schema.

ALTER TABLE search_jobs ADD COLUMN provider_name TEXT;
ALTER TABLE search_jobs ADD COLUMN adults INTEGER NOT NULL DEFAULT 1;
ALTER TABLE search_jobs ADD COLUMN completed_at TEXT;
ALTER TABLE search_jobs ADD COLUMN error_code TEXT;

UPDATE search_jobs SET provider_name = provider WHERE provider_name IS NULL;
UPDATE search_jobs SET adults = adult_count WHERE adults IS NULL;
UPDATE search_jobs SET completed_at = finished_at WHERE completed_at IS NULL AND finished_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_jobs_provider_status
  ON search_jobs(provider_name, status, queued_at);

ALTER TABLE provider_limits ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_limits ADD COLUMN last_failure_at TEXT;

ALTER TABLE fare_checks ADD COLUMN last_revalidated_at TEXT;

-- D1 schema for Malaysia Flight Deal Radar.
-- Money is stored only as integer MYR minor units.

CREATE TABLE IF NOT EXISTS airports (
  iata_code TEXT PRIMARY KEY CHECK (length(iata_code) = 3),
  airport_name TEXT NOT NULL,
  city TEXT NOT NULL,
  country_code TEXT NOT NULL,
  region_group TEXT NOT NULL,
  airport_type TEXT NOT NULL DEFAULT 'airport',
  is_origin INTEGER NOT NULL DEFAULT 0 CHECK (is_origin IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS route_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin_iata TEXT NOT NULL REFERENCES airports(iata_code),
  destination_iata TEXT NOT NULL REFERENCES airports(iata_code),
  country_code TEXT NOT NULL,
  region_group TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  source TEXT NOT NULL DEFAULT 'seed',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_scanned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (origin_iata, destination_iata)
);

CREATE TABLE IF NOT EXISTS search_jobs (
  id TEXT PRIMARY KEY,
  origin_iata TEXT NOT NULL REFERENCES airports(iata_code),
  destination_iata TEXT NOT NULL REFERENCES airports(iata_code),
  departure_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  stay_length_days INTEGER NOT NULL,
  cabin_class TEXT NOT NULL DEFAULT 'economy',
  adult_count INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  queued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_search_jobs_status_priority
  ON search_jobs(status, priority, queued_at);

CREATE TABLE IF NOT EXISTS fare_checks (
  id TEXT PRIMARY KEY,
  search_job_id TEXT REFERENCES search_jobs(id),
  provider TEXT NOT NULL,
  provider_offer_id TEXT NOT NULL,
  origin_iata TEXT NOT NULL REFERENCES airports(iata_code),
  destination_iata TEXT NOT NULL REFERENCES airports(iata_code),
  departure_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  cabin_class TEXT NOT NULL DEFAULT 'economy',
  adult_count INTEGER NOT NULL DEFAULT 1,
  amount_minor_myr INTEGER NOT NULL CHECK (amount_minor_myr > 0),
  currency TEXT NOT NULL DEFAULT 'MYR',
  total_stops INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  carriers_json TEXT NOT NULL DEFAULT '[]',
  self_transfer INTEGER NOT NULL DEFAULT 0 CHECK (self_transfer IN (0, 1)),
  retention_mode TEXT NOT NULL DEFAULT 'NO_CACHE',
  is_revalidated INTEGER NOT NULL DEFAULT 0 CHECK (is_revalidated IN (0, 1)),
  checked_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_fare_checks_route_dates
  ON fare_checks(origin_iata, destination_iata, departure_date, return_date, provider, checked_at);

CREATE TABLE IF NOT EXISTS fare_snapshots (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  origin_iata TEXT NOT NULL REFERENCES airports(iata_code),
  destination_iata TEXT NOT NULL REFERENCES airports(iata_code),
  departure_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  stay_length_days INTEGER NOT NULL,
  cabin_class TEXT NOT NULL DEFAULT 'economy',
  amount_minor_myr INTEGER NOT NULL CHECK (amount_minor_myr > 0),
  observed_at TEXT NOT NULL,
  retention_mode TEXT NOT NULL DEFAULT 'AGGREGATE_ONLY',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_fare_snapshots_baseline
  ON fare_snapshots(origin_iata, destination_iata, stay_length_days, cabin_class, observed_at);

CREATE TABLE IF NOT EXISTS deal_scores (
  id TEXT PRIMARY KEY,
  fare_check_id TEXT NOT NULL REFERENCES fare_checks(id),
  amount_minor_myr INTEGER NOT NULL CHECK (amount_minor_myr > 0),
  baseline_median_minor_myr INTEGER,
  historical_p10_minor_myr INTEGER,
  sample_size INTEGER NOT NULL DEFAULT 0,
  discount_pct REAL NOT NULL DEFAULT 0,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  deal_label TEXT NOT NULL,
  alert_eligible INTEGER NOT NULL DEFAULT 0 CHECK (alert_eligible IN (0, 1)),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  scored_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_deal_scores_label_score
  ON deal_scores(deal_label, score, scored_at);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  deal_score_id TEXT REFERENCES deal_scores(id),
  dedupe_key TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'telegram_deal',
  origin_iata TEXT NOT NULL,
  destination_iata TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  provider TEXT NOT NULL,
  deal_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TEXT NOT NULL,
  cooldown_until TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_dedupe_cooldown
  ON alerts(dedupe_key, cooldown_until);

CREATE TABLE IF NOT EXISTS provider_limits (
  provider TEXT PRIMARY KEY,
  retention_mode TEXT NOT NULL DEFAULT 'NO_CACHE',
  daily_budget INTEGER NOT NULL DEFAULT 0,
  used_today INTEGER NOT NULL DEFAULT 0,
  concurrency_limit INTEGER NOT NULL DEFAULT 1,
  min_request_interval_ms INTEGER NOT NULL DEFAULT 0,
  health_status TEXT NOT NULL DEFAULT 'disabled',
  reset_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  origin_iata TEXT NOT NULL REFERENCES airports(iata_code),
  destination_iata TEXT NOT NULL REFERENCES airports(iata_code),
  departure_date TEXT,
  return_date TEXT,
  stay_length_days INTEGER,
  max_amount_minor_myr INTEGER CHECK (max_amount_minor_myr IS NULL OR max_amount_minor_myr > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_watchlist_active_route
  ON watchlist(active, origin_iata, destination_iata);


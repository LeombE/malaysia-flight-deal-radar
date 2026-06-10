-- Phase 4 Telegram alert delivery fields.
-- These are normalized alert/audit fields only; raw provider payloads are not stored.

ALTER TABLE alerts ADD COLUMN provider_name TEXT;
ALTER TABLE alerts ADD COLUMN deal_score INTEGER;
ALTER TABLE alerts ADD COLUMN amount_minor_myr INTEGER;
ALTER TABLE alerts ADD COLUMN baseline_median_minor_myr INTEGER;
ALTER TABLE alerts ADD COLUMN discount_pct REAL;
ALTER TABLE alerts ADD COLUMN error_code TEXT;
ALTER TABLE alerts ADD COLUMN message_hash TEXT;

UPDATE alerts SET provider_name = provider WHERE provider_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_route_status
  ON alerts(origin_iata, destination_iata, departure_date, return_date, provider_name, deal_label, status, sent_at);


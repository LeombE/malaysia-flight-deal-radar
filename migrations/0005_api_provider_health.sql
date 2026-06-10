-- Phase 5 API/dashboard support fields.

ALTER TABLE provider_limits ADD COLUMN last_success_at TEXT;

CREATE INDEX IF NOT EXISTS idx_airports_origin_active
  ON airports(is_origin, active, iata_code);

CREATE INDEX IF NOT EXISTS idx_route_candidates_destination
  ON route_candidates(destination_iata, origin_iata, active);


-- Phase 8B cached price calendar support.
-- Travelpayouts Data API rows are cached/recently found fares, not live/bookable claims.

INSERT OR REPLACE INTO airports (
  iata_code,
  airport_name,
  city,
  country_code,
  region_group,
  airport_type,
  is_origin,
  active
) VALUES
  ('DAD', 'Da Nang International Airport', 'Da Nang', 'VN', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('PNH', 'Phnom Penh International Airport', 'Phnom Penh', 'KH', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('TSA', 'Taipei Songshan Airport', 'Taipei', 'TW', 'TAIWAN', 'medium_airport', 0, 1),
  ('KHH', 'Kaohsiung International Airport', 'Kaohsiung', 'TW', 'TAIWAN', 'medium_airport', 0, 1),
  ('RMQ', 'Taichung International Airport', 'Taichung', 'TW', 'TAIWAN', 'medium_airport', 0, 1),
  ('NGO', 'Chubu Centrair International Airport', 'Nagoya', 'JP', 'JAPAN', 'large_airport', 0, 1),
  ('CTS', 'New Chitose Airport', 'Sapporo', 'JP', 'JAPAN', 'large_airport', 0, 1),
  ('SHA', 'Shanghai Hongqiao International Airport', 'Shanghai', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('PKX', 'Beijing Daxing International Airport', 'Beijing', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('TFU', 'Chengdu Tianfu International Airport', 'Chengdu', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('CKG', 'Chongqing Jiangbei International Airport', 'Chongqing', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('KMG', 'Kunming Changshui International Airport', 'Kunming', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1);

INSERT OR IGNORE INTO route_candidates (
  origin_iata,
  destination_iata,
  country_code,
  region_group,
  priority,
  source,
  active
)
SELECT
  origins.iata_code,
  destinations.iata_code,
  destinations.country_code,
  destinations.region_group,
  CASE
    WHEN origins.iata_code = 'KUL' THEN 10
    WHEN origins.iata_code = 'JHB' THEN 30
    ELSE 50
  END,
  'seed',
  1
FROM airports origins
JOIN airports destinations
WHERE origins.is_origin = 1
  AND destinations.is_origin = 0
  AND destinations.active = 1
  AND destinations.iata_code IN ('DAD', 'PNH', 'TSA', 'KHH', 'RMQ', 'NGO', 'CTS', 'SHA', 'PKX', 'TFU', 'CKG', 'KMG');

CREATE TABLE IF NOT EXISTS price_calendar_rows (
  id TEXT PRIMARY KEY,
  origin_iata TEXT NOT NULL REFERENCES airports(iata_code),
  destination_iata TEXT NOT NULL REFERENCES airports(iata_code),
  destination_country TEXT NOT NULL,
  destination_region TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  stay_length_days INTEGER NOT NULL,
  trip_type TEXT NOT NULL DEFAULT 'round_trip',
  cabin_class TEXT NOT NULL DEFAULT 'economy',
  adults INTEGER NOT NULL DEFAULT 1,
  amount_minor_myr INTEGER CHECK (amount_minor_myr IS NULL OR amount_minor_myr > 0),
  original_amount REAL NOT NULL,
  original_currency TEXT NOT NULL,
  airline_iata TEXT,
  flight_number TEXT,
  stops INTEGER,
  total_duration_minutes INTEGER,
  provider_name TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  expires_at TEXT,
  freshness_label TEXT NOT NULL CHECK (freshness_label IN ('fresh', 'recent', 'cached', 'expired')),
  is_live INTEGER NOT NULL DEFAULT 0 CHECK (is_live = 0),
  is_bookable_claim INTEGER NOT NULL DEFAULT 0 CHECK (is_bookable_claim = 0),
  search_link TEXT,
  warning TEXT NOT NULL,
  deal_label TEXT,
  deal_score INTEGER CHECK (deal_score IS NULL OR deal_score BETWEEN 0 AND 100),
  retention_mode TEXT NOT NULL DEFAULT 'AGGREGATE_ONLY',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_price_calendar_route_date
  ON price_calendar_rows(origin_iata, destination_iata, departure_date, amount_minor_myr);

CREATE INDEX IF NOT EXISTS idx_price_calendar_region_country
  ON price_calendar_rows(destination_region, destination_country, amount_minor_myr);

CREATE INDEX IF NOT EXISTS idx_price_calendar_freshness
  ON price_calendar_rows(freshness_label, expires_at);

CREATE INDEX IF NOT EXISTS idx_price_calendar_provider_retrieved
  ON price_calendar_rows(provider_name, retrieved_at);

DELETE FROM price_calendar_rows
WHERE provider_name = 'travelpayouts_demo'
  AND id LIKE 'calendar-demo-%';

INSERT INTO price_calendar_rows (
  id, origin_iata, destination_iata, destination_country, destination_region,
  departure_date, return_date, stay_length_days, trip_type, cabin_class, adults,
  amount_minor_myr, original_amount, original_currency, airline_iata, flight_number,
  stops, total_duration_minutes, provider_name, source_endpoint, retrieved_at,
  expires_at, freshness_label, is_live, is_bookable_claim, search_link, warning,
  retention_mode
) VALUES
  ('calendar-demo-001', 'KUL', 'TPE', 'TW', 'TAIWAN', '2026-07-25', '2026-07-30', 5, 'round_trip', 'economy', 1, 45900, 459.00, 'MYR', 'D7', '376', 0, 280, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-10T08:00:00.000Z', NULL, 'fresh', 0, 0, 'https://www.aviasales.com/search/KUL260725TPE2607301', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-002', 'KUL', 'TPE', 'TW', 'TAIWAN', '2026-08-02', '2026-08-07', 5, 'round_trip', 'economy', 1, 48800, 488.00, 'MYR', 'OD', '882', 0, 285, 'travelpayouts_demo', 'v2/prices/month-matrix', '2026-06-09T10:00:00.000Z', NULL, 'recent', 0, 0, 'https://www.aviasales.com/search/KUL260802TPE2608071', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-003', 'KUL', 'TPE', 'TW', 'TAIWAN', '2026-08-16', '2026-08-21', 5, 'round_trip', 'economy', 1, 53600, 536.00, 'MYR', 'CI', '722', 0, 290, 'travelpayouts_demo', 'v2/prices/week-matrix', '2026-06-06T08:00:00.000Z', NULL, 'cached', 0, 0, 'https://www.aviasales.com/search/KUL260816TPE2608211', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-004', 'KUL', 'BKK', 'TH', 'SOUTHEAST_ASIA', '2026-07-25', '2026-07-30', 5, 'round_trip', 'economy', 1, 44100, 441.00, 'MYR', 'AK', '884', 0, 135, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-10T08:00:00.000Z', NULL, 'fresh', 0, 0, 'https://www.aviasales.com/search/KUL260725BKK2607301', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-005', 'KUL', 'BKK', 'TH', 'SOUTHEAST_ASIA', '2026-08-01', '2026-08-06', 5, 'round_trip', 'economy', 1, 46300, 463.00, 'MYR', 'FD', '320', 0, 140, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-09T10:00:00.000Z', NULL, 'recent', 0, 0, 'https://www.aviasales.com/search/KUL260801BKK2608061', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-006', 'KUL', 'BKK', 'TH', 'SOUTHEAST_ASIA', '2026-08-22', '2026-08-27', 5, 'round_trip', 'economy', 1, 51200, 512.00, 'MYR', 'MH', '782', 0, 145, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-06T08:00:00.000Z', NULL, 'cached', 0, 0, 'https://www.aviasales.com/search/KUL260822BKK2608271', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-007', 'KUL', 'SIN', 'SG', 'SOUTHEAST_ASIA', '2026-07-26', '2026-07-31', 5, 'round_trip', 'economy', 1, 35800, 358.00, 'MYR', 'AK', '701', 0, 70, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-10T08:00:00.000Z', NULL, 'fresh', 0, 0, 'https://www.aviasales.com/search/KUL260726SIN2607311', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-008', 'KUL', 'SIN', 'SG', 'SOUTHEAST_ASIA', '2026-08-09', '2026-08-14', 5, 'round_trip', 'economy', 1, 40200, 402.00, 'MYR', 'TR', '469', 0, 75, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-09T10:00:00.000Z', NULL, 'recent', 0, 0, 'https://www.aviasales.com/search/KUL260809SIN2608141', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-009', 'KUL', 'SIN', 'SG', 'SOUTHEAST_ASIA', '2026-08-23', '2026-08-28', 5, 'round_trip', 'economy', 1, 43100, 431.00, 'MYR', 'SQ', '105', 0, 75, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-06T08:00:00.000Z', NULL, 'cached', 0, 0, 'https://www.aviasales.com/search/KUL260823SIN2608281', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-010', 'KUL', 'NRT', 'JP', 'JAPAN', '2026-07-25', '2026-07-30', 5, 'round_trip', 'economy', 1, 78900, 789.00, 'MYR', 'D7', '522', 0, 430, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-10T08:00:00.000Z', NULL, 'fresh', 0, 0, 'https://www.aviasales.com/search/KUL260725NRT2607301', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-011', 'KUL', 'NRT', 'JP', 'JAPAN', '2026-08-04', '2026-08-09', 5, 'round_trip', 'economy', 1, 83600, 836.00, 'MYR', 'VN', '676', 1, 610, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-09T10:00:00.000Z', NULL, 'recent', 0, 0, 'https://www.aviasales.com/search/KUL260804NRT2608091', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-012', 'KUL', 'NRT', 'JP', 'JAPAN', '2026-08-18', '2026-08-23', 5, 'round_trip', 'economy', 1, 91800, 918.00, 'MYR', 'PR', '526', 1, 650, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-06T08:00:00.000Z', NULL, 'cached', 0, 0, 'https://www.aviasales.com/search/KUL260818NRT2608231', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-013', 'KUL', 'KIX', 'JP', 'JAPAN', '2026-07-28', '2026-08-02', 5, 'round_trip', 'economy', 1, 74200, 742.00, 'MYR', 'D7', '533', 0, 405, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-10T08:00:00.000Z', NULL, 'fresh', 0, 0, 'https://www.aviasales.com/search/KUL260728KIX2608021', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-014', 'KUL', 'KIX', 'JP', 'JAPAN', '2026-08-11', '2026-08-16', 5, 'round_trip', 'economy', 1, 79800, 798.00, 'MYR', 'VJ', '826', 1, 590, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-09T10:00:00.000Z', NULL, 'recent', 0, 0, 'https://www.aviasales.com/search/KUL260811KIX2608161', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-015', 'KUL', 'KIX', 'JP', 'JAPAN', '2026-08-25', '2026-08-30', 5, 'round_trip', 'economy', 1, 86900, 869.00, 'MYR', 'MU', '8642', 1, 615, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-06T08:00:00.000Z', NULL, 'cached', 0, 0, 'https://www.aviasales.com/search/KUL260825KIX2608301', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-016', 'KUL', 'PVG', 'CN', 'MAINLAND_CHINA', '2026-07-27', '2026-08-01', 5, 'round_trip', 'economy', 1, 61200, 612.00, 'MYR', 'MU', '8642', 0, 330, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-10T08:00:00.000Z', NULL, 'fresh', 0, 0, 'https://www.aviasales.com/search/KUL260727PVG2608011', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-017', 'KUL', 'PVG', 'CN', 'MAINLAND_CHINA', '2026-08-10', '2026-08-15', 5, 'round_trip', 'economy', 1, 66400, 664.00, 'MYR', 'CZ', '350', 1, 455, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-09T10:00:00.000Z', NULL, 'recent', 0, 0, 'https://www.aviasales.com/search/KUL260810PVG2608151', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-018', 'KUL', 'PVG', 'CN', 'MAINLAND_CHINA', '2026-08-24', '2026-08-29', 5, 'round_trip', 'economy', 1, 72500, 725.00, 'MYR', 'MF', '848', 1, 520, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-06T08:00:00.000Z', NULL, 'cached', 0, 0, 'https://www.aviasales.com/search/KUL260824PVG2608291', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-019', 'KUL', 'CAN', 'CN', 'MAINLAND_CHINA', '2026-07-29', '2026-08-03', 5, 'round_trip', 'economy', 1, 55200, 552.00, 'MYR', 'CZ', '8072', 0, 245, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-10T08:00:00.000Z', NULL, 'fresh', 0, 0, 'https://www.aviasales.com/search/KUL260729CAN2608031', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-020', 'KUL', 'CAN', 'CN', 'MAINLAND_CHINA', '2026-08-12', '2026-08-17', 5, 'round_trip', 'economy', 1, 58900, 589.00, 'MYR', 'AK', '112', 0, 250, 'travelpayouts_demo', 'v2/prices/latest', '2026-06-09T10:00:00.000Z', NULL, 'recent', 0, 0, 'https://www.aviasales.com/search/KUL260812CAN2608171', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY'),
  ('calendar-demo-021', 'KUL', 'CAN', 'CN', 'MAINLAND_CHINA', '2026-06-01', '2026-06-06', 5, 'round_trip', 'economy', 1, 59900, 599.00, 'MYR', 'CZ', '366', 0, 250, 'travelpayouts_demo', 'v2/prices/latest', '2026-05-20T08:00:00.000Z', '2026-06-01T00:00:00.000Z', 'expired', 0, 0, 'https://www.aviasales.com/search/KUL260601CAN2606061', 'Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.', 'AGGREGATE_ONLY');

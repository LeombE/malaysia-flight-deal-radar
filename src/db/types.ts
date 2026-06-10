export interface AirportRecord {
  iata_code: string;
  airport_name: string;
  city: string;
  country_code: string;
  region_group: string;
  airport_type: string;
  is_origin: 0 | 1;
  active: 0 | 1;
}

export interface FareCheckRecord {
  id: string;
  provider: string;
  provider_offer_id: string;
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string;
  amount_minor_myr: number;
  total_stops: number;
  duration_minutes: number;
  carriers_json: string;
  self_transfer: 0 | 1;
  is_revalidated: 0 | 1;
  checked_at: string;
  expires_at: string | null;
}

export interface DealScoreRecord {
  id: string;
  fare_check_id: string;
  amount_minor_myr: number;
  baseline_median_minor_myr: number | null;
  historical_p10_minor_myr: number | null;
  sample_size: number;
  discount_pct: number;
  score: number;
  deal_label: string;
  alert_eligible: 0 | 1;
  reasons_json: string;
  scored_at: string;
}

export interface AlertRecord {
  id: string;
  dedupe_key: string;
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string;
  provider: string;
  deal_label: string;
  sent_at: string;
  cooldown_until: string;
}


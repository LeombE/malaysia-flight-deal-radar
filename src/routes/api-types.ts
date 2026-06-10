import type { DealLabel } from "../scoring/types.ts";
import type { ProviderReadinessReport } from "../providers/readiness.ts";

export interface AirportApiRecord {
  iata_code: string;
  airport_name: string;
  city: string;
  country_code: string;
  region_group: string;
  active: boolean;
}

export interface DestinationFilters {
  origin_iata?: string;
  country_code?: string;
  region_group?: string;
}

export interface DealFilters {
  origin_iata?: string;
  destination_iata?: string;
  country_code?: string;
  region_group?: string;
  deal_label?: DealLabel;
  min_score?: number;
  max_stops?: number;
  departure_from?: string;
  departure_to?: string;
  stay_length_days?: number;
  min_stay_length_days?: number;
  max_stay_length_days?: number;
  provider_name?: string;
  only_alert_eligible?: boolean;
  only_recently_verified?: boolean;
}

export interface DealApiRecord {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  stay_length_days: number;
  amount_minor_myr: number;
  display_price_rm: string;
  baseline_median_minor_myr: number | null;
  historical_p10_minor_myr: number | null;
  discount_pct: number;
  deal_score: number;
  deal_label: DealLabel;
  carrier: string;
  stops: number;
  total_duration_minutes: number;
  provider_name: string;
  last_revalidated_at: string | null;
  expires_at: string | null;
  alert_status: string | null;
  warning: string | null;
  is_live: boolean;
  deep_link?: string;
}

export interface PriceHistoryFilters {
  origin_iata?: string;
  destination_iata?: string;
  provider_name?: string;
  departure_from?: string;
  departure_to?: string;
}

export interface PriceHistoryApiRecord {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  provider: string;
  amount_minor_myr: number;
  retrieved_at: string;
  revalidated_at: string | null;
}

export interface ProviderLimitApiRecord {
  provider_name: string;
  retention_mode: string;
  daily_budget: number | null;
  used_today: number | null;
  remaining_budget: number | null;
  health_status: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
}

export interface ProviderHealthApiRecord extends ProviderLimitApiRecord {
  enabled: boolean;
  status: string;
  checked_at: string | null;
  message: string | null;
  retry_after_ms: number | null;
  readiness?: ProviderReadinessReport;
}

export interface ApiRepository {
  listOrigins(): Promise<AirportApiRecord[]>;
  listDestinations(filters: DestinationFilters): Promise<AirportApiRecord[]>;
  listDeals(filters: DealFilters, now: Date, freshWithinMinutes: number): Promise<DealApiRecord[]>;
  listPriceHistory(filters: PriceHistoryFilters): Promise<PriceHistoryApiRecord[]>;
  listProviderLimits(): Promise<ProviderLimitApiRecord[]>;
}

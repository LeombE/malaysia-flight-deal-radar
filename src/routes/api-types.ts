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

export type PriceCalendarFreshnessLabel = "fresh" | "recent" | "cached" | "expired";

export type PriceCalendarSortBy = "price" | "departure_date" | "duration" | "stops";

export type PriceCalendarSortOrder = "asc" | "desc";

export interface PriceCalendarFilters {
  origin_iata?: string;
  destination_iata?: string;
  destination_region?: string;
  destination_country?: string;
  provider_name?: string;
  departure_from?: string;
  departure_to?: string;
  stay_length_days?: number;
  cabin_class?: "economy";
  adults?: number;
  max_stops?: number;
  freshness?: PriceCalendarFreshnessLabel;
  include_expired?: boolean;
  sort_by?: PriceCalendarSortBy;
  sort_order?: PriceCalendarSortOrder;
}

export interface PriceCalendarApiRecord {
  origin_iata: string;
  destination_iata: string;
  destination_country: string;
  destination_region: string;
  departure_date: string;
  return_date: string;
  stay_length_days: number;
  trip_type: "round_trip";
  cabin_class: "economy";
  adults: number;
  amount_minor_myr: number | null;
  display_price_rm: string;
  original_amount: number;
  original_currency: string;
  airline_iata: string | null;
  flight_number: string | null;
  stops: number | null;
  total_duration_minutes: number | null;
  provider_name: string;
  source_endpoint: string;
  retrieved_at: string;
  expires_at: string | null;
  freshness_label: PriceCalendarFreshnessLabel;
  is_live: false;
  is_bookable_claim: false;
  search_link: string | null;
  warning: string;
  deal_label: DealLabel | null;
  deal_score: number | null;
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
  listPriceCalendar(filters: PriceCalendarFilters, now: Date): Promise<PriceCalendarApiRecord[]>;
  listProviderLimits(): Promise<ProviderLimitApiRecord[]>;
}

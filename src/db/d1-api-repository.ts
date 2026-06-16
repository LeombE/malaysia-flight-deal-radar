import { formatMyrFromMinor } from "../scoring/statistics.ts";
import type {
  AirportApiRecord,
  ApiRepository,
  DealApiRecord,
  DealFilters,
  DestinationFilters,
  PriceCalendarApiRecord,
  PriceCalendarFilters,
  PriceHistoryApiRecord,
  PriceHistoryFilters,
  ProviderLimitApiRecord
} from "../routes/api-types.ts";
import type { D1DatabaseLike } from "./d1-scan-repository.ts";

interface AirportRow {
  iata_code: string;
  airport_name: string;
  city: string;
  country_code: string;
  region_group: string;
  active: number;
}

interface DealRow {
  origin_iata: string;
  destination_iata: string;
  country_code: string;
  region_group: string;
  departure_date: string;
  return_date: string;
  amount_minor_myr: number;
  baseline_median_minor_myr: number | null;
  historical_p10_minor_myr: number | null;
  discount_pct: number;
  score: number;
  deal_label: DealApiRecord["deal_label"];
  carriers_json: string;
  total_stops: number;
  duration_minutes: number;
  provider: string;
  last_revalidated_at: string | null;
  checked_at: string;
  expires_at: string | null;
  alert_status: string | null;
}

interface PriceHistoryRow {
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string;
  provider: string;
  amount_minor_myr: number;
  observed_at: string;
  revalidated_at: string | null;
}

interface PriceCalendarRow {
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
  freshness_label: PriceCalendarApiRecord["freshness_label"];
  search_link: string | null;
  warning: string | null;
  deal_label: PriceCalendarApiRecord["deal_label"];
  deal_score: number | null;
}

interface ProviderLimitRow {
  provider: string;
  retention_mode: string;
  daily_budget: number | null;
  used_today: number | null;
  health_status: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number | null;
}

function mapAirport(row: AirportRow): AirportApiRecord {
  return {
    iata_code: row.iata_code,
    airport_name: row.airport_name,
    city: row.city,
    country_code: row.country_code,
    region_group: row.region_group,
    active: row.active === 1
  };
}

function parseCarriers(carriersJson: string): string {
  try {
    const carriers = JSON.parse(carriersJson) as unknown;
    return Array.isArray(carriers) ? carriers.filter((carrier) => typeof carrier === "string").join(", ") : "";
  } catch {
    return "";
  }
}

function minutesBetween(later: Date, earlierIso: string | null): number {
  if (!earlierIso) return Number.POSITIVE_INFINITY;
  const earlier = Date.parse(earlierIso);
  if (!Number.isFinite(earlier)) return Number.POSITIVE_INFINITY;
  return (later.getTime() - earlier) / 60_000;
}

function warningFor(row: DealRow, now: Date, freshWithinMinutes: number): { warning: string | null; isLive: boolean } {
  const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime()) {
    return { warning: "Expired offer. Do not treat as live fare.", isLive: false };
  }
  if (minutesBetween(now, row.last_revalidated_at) > freshWithinMinutes) {
    return { warning: "Stale fare. Revalidate before alert or purchase.", isLive: false };
  }
  return { warning: null, isLive: true };
}

function calendarWarning(row: PriceCalendarRow): string {
  return row.warning ||
    "Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.";
}

function mapPriceCalendarRow(row: PriceCalendarRow, now: Date): PriceCalendarApiRecord {
  const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
  const expired = Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime();
  const freshnessLabel = expired ? "expired" : row.freshness_label;
  return {
    origin_iata: row.origin_iata,
    destination_iata: row.destination_iata,
    destination_country: row.destination_country,
    destination_region: row.destination_region,
    departure_date: row.departure_date,
    return_date: row.return_date,
    stay_length_days: row.stay_length_days,
    trip_type: row.trip_type,
    cabin_class: row.cabin_class,
    adults: row.adults,
    amount_minor_myr: row.amount_minor_myr,
    display_price_rm: row.amount_minor_myr === null ? "Unavailable" : `RM${formatMyrFromMinor(row.amount_minor_myr) ?? "0.00"}`,
    original_amount: row.original_amount,
    original_currency: row.original_currency,
    airline_iata: row.airline_iata,
    flight_number: row.flight_number,
    stops: row.stops,
    total_duration_minutes: row.total_duration_minutes,
    provider_name: row.provider_name,
    source_endpoint: row.source_endpoint,
    retrieved_at: row.retrieved_at,
    expires_at: row.expires_at,
    freshness_label: freshnessLabel,
    is_live: false,
    is_bookable_claim: false,
    search_link: row.search_link,
    warning: calendarWarning(row),
    deal_label: row.deal_label,
    deal_score: row.deal_score
  };
}

function calendarSortClause(filters: PriceCalendarFilters): string {
  const direction = filters.sort_order === "desc" ? "DESC" : "ASC";
  if (filters.sort_by === "departure_date") {
    return `pc.departure_date ${direction}, pc.amount_minor_myr ASC, COALESCE(pc.stops, 99) ASC`;
  }
  if (filters.sort_by === "duration") {
    return `COALESCE(pc.total_duration_minutes, 999999) ${direction}, pc.amount_minor_myr ASC, COALESCE(pc.stops, 99) ASC`;
  }
  if (filters.sort_by === "stops") {
    return `COALESCE(pc.stops, 99) ${direction}, pc.amount_minor_myr ASC, COALESCE(pc.total_duration_minutes, 999999) ASC`;
  }
  return `CASE WHEN pc.amount_minor_myr IS NULL THEN 1 ELSE 0 END ASC, pc.amount_minor_myr ${direction}, COALESCE(pc.stops, 99) ASC, COALESCE(pc.total_duration_minutes, 999999) ASC, pc.departure_date ASC`;
}

export class D1ApiRepository implements ApiRepository {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  async listOrigins(): Promise<AirportApiRecord[]> {
    const result = await this.db.prepare(`
      SELECT iata_code, airport_name, city, country_code, region_group, active
      FROM airports
      WHERE is_origin = 1 AND active = 1
      ORDER BY iata_code ASC
    `).all<AirportRow>();
    return (result.results ?? []).map(mapAirport);
  }

  async listDestinations(filters: DestinationFilters): Promise<AirportApiRecord[]> {
    const clauses = ["a.is_origin = 0", "a.active = 1"];
    const params: unknown[] = [];
    if (filters.country_code) {
      clauses.push("a.country_code = ?");
      params.push(filters.country_code);
    }
    if (filters.region_group) {
      clauses.push("a.region_group = ?");
      params.push(filters.region_group);
    }
    if (filters.origin_iata) {
      clauses.push("EXISTS (SELECT 1 FROM route_candidates rc WHERE rc.destination_iata = a.iata_code AND rc.origin_iata = ? AND rc.active = 1)");
      params.push(filters.origin_iata);
    }

    const result = await this.db.prepare(`
      SELECT a.iata_code, a.airport_name, a.city, a.country_code, a.region_group, a.active
      FROM airports a
      WHERE ${clauses.join(" AND ")}
      ORDER BY a.country_code ASC, a.iata_code ASC
    `).bind(...params).all<AirportRow>();
    return (result.results ?? []).map(mapAirport);
  }

  async listDeals(filters: DealFilters, now: Date, freshWithinMinutes: number): Promise<DealApiRecord[]> {
    const clauses = ["1 = 1"];
    const params: unknown[] = [];
    if (filters.origin_iata) {
      clauses.push("fc.origin_iata = ?");
      params.push(filters.origin_iata);
    }
    if (filters.destination_iata) {
      clauses.push("fc.destination_iata = ?");
      params.push(filters.destination_iata);
    }
    if (filters.country_code) {
      clauses.push("a.country_code = ?");
      params.push(filters.country_code);
    }
    if (filters.region_group) {
      clauses.push("a.region_group = ?");
      params.push(filters.region_group);
    }
    if (filters.deal_label) {
      clauses.push("ds.deal_label = ?");
      params.push(filters.deal_label);
    }
    if (filters.min_score !== undefined) {
      clauses.push("ds.score >= ?");
      params.push(filters.min_score);
    }
    if (filters.max_stops !== undefined) {
      clauses.push("fc.total_stops <= ?");
      params.push(filters.max_stops);
    }
    if (filters.departure_from) {
      clauses.push("fc.departure_date >= ?");
      params.push(filters.departure_from);
    }
    if (filters.departure_to) {
      clauses.push("fc.departure_date <= ?");
      params.push(filters.departure_to);
    }
    if (filters.provider_name) {
      clauses.push("fc.provider = ?");
      params.push(filters.provider_name);
    }
    if (filters.only_alert_eligible) {
      clauses.push("ds.alert_eligible = 1");
    }

    const result = await this.db.prepare(`
      SELECT
        fc.origin_iata,
        fc.destination_iata,
        a.country_code,
        a.region_group,
        fc.departure_date,
        fc.return_date,
        fc.amount_minor_myr,
        ds.baseline_median_minor_myr,
        ds.historical_p10_minor_myr,
        ds.discount_pct,
        ds.score,
        ds.deal_label,
        fc.carriers_json,
        fc.total_stops,
        fc.duration_minutes,
        fc.provider,
        fc.last_revalidated_at,
        fc.checked_at,
        fc.expires_at,
        (
          SELECT status
          FROM alerts al
          WHERE al.origin_iata = fc.origin_iata
            AND al.destination_iata = fc.destination_iata
            AND al.departure_date = fc.departure_date
            AND al.return_date = fc.return_date
            AND al.provider = fc.provider
          ORDER BY al.sent_at DESC
          LIMIT 1
        ) AS alert_status
      FROM deal_scores ds
      JOIN fare_checks fc ON fc.id = ds.fare_check_id
      JOIN airports a ON a.iata_code = fc.destination_iata
      WHERE ${clauses.join(" AND ")}
      ORDER BY ds.score DESC, ds.scored_at DESC
      LIMIT 100
    `).bind(...params).all<DealRow>();

    const deals = (result.results ?? []).map((row) => {
      const freshness = warningFor(row, now, freshWithinMinutes);
      const stayLengthDays = Math.round((Date.parse(`${row.return_date}T00:00:00.000Z`) - Date.parse(`${row.departure_date}T00:00:00.000Z`)) / 86_400_000);
      return {
        origin: row.origin_iata,
        destination: row.destination_iata,
        departure_date: row.departure_date,
        return_date: row.return_date,
        stay_length_days: stayLengthDays,
        amount_minor_myr: row.amount_minor_myr,
        display_price_rm: `RM${formatMyrFromMinor(row.amount_minor_myr) ?? "0.00"}`,
        baseline_median_minor_myr: row.baseline_median_minor_myr,
        historical_p10_minor_myr: row.historical_p10_minor_myr,
        discount_pct: row.discount_pct,
        deal_score: row.score,
        deal_label: row.deal_label,
        carrier: parseCarriers(row.carriers_json),
        stops: row.total_stops,
        total_duration_minutes: row.duration_minutes,
        provider_name: row.provider,
        last_revalidated_at: row.last_revalidated_at,
        expires_at: row.expires_at,
        alert_status: row.alert_status,
        warning: freshness.warning,
        is_live: freshness.isLive
      } satisfies DealApiRecord;
    });

    const stayFiltered = deals.filter((deal) => {
      if (filters.stay_length_days !== undefined && deal.stay_length_days !== filters.stay_length_days) return false;
      if (filters.min_stay_length_days !== undefined && deal.stay_length_days < filters.min_stay_length_days) return false;
      if (filters.max_stay_length_days !== undefined && deal.stay_length_days > filters.max_stay_length_days) return false;
      return true;
    });

    return filters.only_recently_verified ? stayFiltered.filter((deal) => deal.is_live) : stayFiltered;
  }

  async listPriceHistory(filters: PriceHistoryFilters): Promise<PriceHistoryApiRecord[]> {
    const clauses = ["1 = 1"];
    const params: unknown[] = [];
    if (filters.origin_iata) {
      clauses.push("fs.origin_iata = ?");
      params.push(filters.origin_iata);
    }
    if (filters.destination_iata) {
      clauses.push("fs.destination_iata = ?");
      params.push(filters.destination_iata);
    }
    if (filters.provider_name) {
      clauses.push("fs.provider = ?");
      params.push(filters.provider_name);
    }
    if (filters.departure_from) {
      clauses.push("fs.departure_date >= ?");
      params.push(filters.departure_from);
    }
    if (filters.departure_to) {
      clauses.push("fs.departure_date <= ?");
      params.push(filters.departure_to);
    }

    const result = await this.db.prepare(`
      SELECT
        fs.origin_iata,
        fs.destination_iata,
        fs.departure_date,
        fs.return_date,
        fs.provider,
        fs.amount_minor_myr,
        fs.observed_at,
        (
          SELECT MAX(fc.last_revalidated_at)
          FROM fare_checks fc
          WHERE fc.origin_iata = fs.origin_iata
            AND fc.destination_iata = fs.destination_iata
            AND fc.departure_date = fs.departure_date
            AND fc.return_date = fs.return_date
            AND fc.provider = fs.provider
        ) AS revalidated_at
      FROM fare_snapshots fs
      WHERE ${clauses.join(" AND ")}
      ORDER BY fs.observed_at DESC
      LIMIT 200
    `).bind(...params).all<PriceHistoryRow>();

    return (result.results ?? []).map((row) => ({
      origin: row.origin_iata,
      destination: row.destination_iata,
      departure_date: row.departure_date,
      return_date: row.return_date,
      provider: row.provider,
      amount_minor_myr: row.amount_minor_myr,
      retrieved_at: row.observed_at,
      revalidated_at: row.revalidated_at
    }));
  }

  async listPriceCalendar(filters: PriceCalendarFilters, now: Date): Promise<PriceCalendarApiRecord[]> {
    const clauses = ["1 = 1"];
    const params: unknown[] = [];
    if (filters.origin_iata) {
      clauses.push("pc.origin_iata = ?");
      params.push(filters.origin_iata);
    }
    if (filters.destination_iata) {
      clauses.push("pc.destination_iata = ?");
      params.push(filters.destination_iata);
    }
    if (filters.destination_region) {
      clauses.push("pc.destination_region = ?");
      params.push(filters.destination_region);
    }
    if (filters.destination_country) {
      clauses.push("pc.destination_country = ?");
      params.push(filters.destination_country);
    }
    if (filters.departure_from) {
      clauses.push("pc.departure_date >= ?");
      params.push(filters.departure_from);
    }
    if (filters.departure_to) {
      clauses.push("pc.departure_date <= ?");
      params.push(filters.departure_to);
    }
    if (filters.stay_length_days !== undefined) {
      clauses.push("pc.stay_length_days = ?");
      params.push(filters.stay_length_days);
    }
    if (filters.cabin_class) {
      clauses.push("pc.cabin_class = ?");
      params.push(filters.cabin_class);
    }
    if (filters.adults !== undefined) {
      clauses.push("pc.adults = ?");
      params.push(filters.adults);
    }
    if (filters.max_stops !== undefined) {
      clauses.push("COALESCE(pc.stops, 99) <= ?");
      params.push(filters.max_stops);
    }
    if (filters.freshness) {
      clauses.push("pc.freshness_label = ?");
      params.push(filters.freshness);
    }
    if (!filters.include_expired) {
      clauses.push("pc.freshness_label <> 'expired'");
      clauses.push("(pc.expires_at IS NULL OR pc.expires_at > ?)");
      params.push(now.toISOString());
    }

    const result = await this.db.prepare(`
      SELECT
        pc.origin_iata,
        pc.destination_iata,
        pc.destination_country,
        pc.destination_region,
        pc.departure_date,
        pc.return_date,
        pc.stay_length_days,
        pc.trip_type,
        pc.cabin_class,
        pc.adults,
        pc.amount_minor_myr,
        pc.original_amount,
        pc.original_currency,
        pc.airline_iata,
        pc.flight_number,
        pc.stops,
        pc.total_duration_minutes,
        pc.provider_name,
        pc.source_endpoint,
        pc.retrieved_at,
        pc.expires_at,
        pc.freshness_label,
        pc.search_link,
        pc.warning,
        pc.deal_label,
        pc.deal_score
      FROM price_calendar_rows pc
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${calendarSortClause(filters)}
      LIMIT 200
    `).bind(...params).all<PriceCalendarRow>();

    return (result.results ?? []).map((row) => mapPriceCalendarRow(row, now));
  }

  async listProviderLimits(): Promise<ProviderLimitApiRecord[]> {
    const result = await this.db.prepare(`
      SELECT provider, retention_mode, daily_budget, used_today, health_status,
             last_success_at, last_failure_at, failure_count
      FROM provider_limits
      ORDER BY provider ASC
    `).all<ProviderLimitRow>();

    return (result.results ?? []).map((row) => ({
      provider_name: row.provider,
      retention_mode: row.retention_mode,
      daily_budget: row.daily_budget,
      used_today: row.used_today,
      remaining_budget:
        row.daily_budget === null || row.used_today === null
          ? null
          : Math.max(0, row.daily_budget - row.used_today),
      health_status: row.health_status,
      last_success_at: row.last_success_at,
      last_failure_at: row.last_failure_at,
      failure_count: row.failure_count ?? 0
    }));
  }
}

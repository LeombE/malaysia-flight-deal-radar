import { formatMyrFromMinor } from "../scoring/statistics.ts";
import type {
  AirportApiRecord,
  ApiRepository,
  DealApiRecord,
  DealFilters,
  DestinationFilters,
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

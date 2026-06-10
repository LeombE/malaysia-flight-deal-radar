import type { HistoricalFareSample } from "../scoring/types.ts";
import type {
  PersistedDealScore,
  PersistedFareCheck,
  PersistedFareSnapshot,
  PlannedSearchJob,
  ProviderLimitState,
  ScanRepository,
  ScanRouteCandidate,
  SearchJobUpdate
} from "../scanner/types.ts";

export interface D1Result<T = unknown> {
  results?: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
}

interface RouteRow {
  origin_iata: string;
  destination_iata: string;
  country_code?: string;
  region_group?: string;
  priority?: number;
  source?: string;
  departure_date?: string | null;
  return_date?: string | null;
  stay_length_days?: number | null;
}

interface ProviderLimitRow {
  provider: string;
  retention_mode: "NO_CACHE" | "AGGREGATE_ONLY" | "RAW_ALLOWED";
  daily_budget: number;
  used_today: number;
  concurrency_limit: number;
  health_status: string;
  failure_count?: number;
}

function mapRoute(row: RouteRow): ScanRouteCandidate {
  const route: ScanRouteCandidate = {
    originIata: row.origin_iata,
    destinationIata: row.destination_iata
  };
  if (row.country_code) route.countryCode = row.country_code;
  if (row.region_group) route.regionGroup = row.region_group;
  if (row.priority !== undefined) route.priority = row.priority;
  if (row.source) route.source = row.source;
  if (row.departure_date) route.departureDate = row.departure_date;
  if (row.return_date) route.returnDate = row.return_date;
  if (row.stay_length_days) route.stayLengthDays = row.stay_length_days;
  return route;
}

async function allRoutes(statement: D1PreparedStatement): Promise<ScanRouteCandidate[]> {
  const result = await statement.all<RouteRow>();
  return (result.results ?? []).map(mapRoute);
}

export class D1ScanRepository implements ScanRepository {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  listWatchlistRoutes(): Promise<ScanRouteCandidate[]> {
    return allRoutes(this.db.prepare(`
      SELECT
        w.origin_iata,
        w.destination_iata,
        a.country_code,
        a.region_group,
        0 AS priority,
        'watchlist' AS source,
        w.departure_date,
        w.return_date,
        w.stay_length_days
      FROM watchlist w
      JOIN airports a ON a.iata_code = w.destination_iata
      WHERE w.active = 1
      ORDER BY w.created_at ASC, w.origin_iata ASC, w.destination_iata ASC
    `));
  }

  listPreviousDealRoutes(): Promise<ScanRouteCandidate[]> {
    return allRoutes(this.db.prepare(`
      SELECT
        fc.origin_iata,
        fc.destination_iata,
        a.country_code,
        a.region_group,
        20 - MAX(ds.score) AS priority,
        'previous_deal' AS source
      FROM deal_scores ds
      JOIN fare_checks fc ON fc.id = ds.fare_check_id
      JOIN airports a ON a.iata_code = fc.destination_iata
      WHERE ds.deal_label IN ('strong_deal', 'suspected_deal')
      GROUP BY fc.origin_iata, fc.destination_iata, a.country_code, a.region_group
      ORDER BY MAX(ds.score) DESC, fc.origin_iata ASC, fc.destination_iata ASC
    `));
  }

  listPopularSeedRoutes(): Promise<ScanRouteCandidate[]> {
    return allRoutes(this.db.prepare(`
      SELECT
        origin_iata,
        destination_iata,
        country_code,
        region_group,
        priority,
        source
      FROM route_candidates
      WHERE active = 1 AND source = 'seed'
      ORDER BY priority ASC, origin_iata ASC, destination_iata ASC
    `));
  }

  listExplorationRoutes(): Promise<ScanRouteCandidate[]> {
    return allRoutes(this.db.prepare(`
      SELECT
        origin_iata,
        destination_iata,
        country_code,
        region_group,
        999 AS priority,
        'exploration' AS source
      FROM route_candidates
      WHERE active = 1
      ORDER BY COALESCE(last_scanned_at, '1970-01-01T00:00:00.000Z') ASC,
               destination_iata ASC,
               origin_iata ASC
    `));
  }

  async getHistoricalSamples(route: PlannedSearchJob): Promise<HistoricalFareSample[]> {
    const result = await this.db.prepare(`
      SELECT amount_minor_myr
      FROM fare_snapshots
      WHERE origin_iata = ?
        AND destination_iata = ?
        AND stay_length_days = ?
        AND cabin_class = 'economy'
      ORDER BY observed_at DESC
      LIMIT 180
    `).bind(route.originIata, route.destinationIata, route.stayLengthDays).all<{ amount_minor_myr: number }>();
    return (result.results ?? []).map((row) => ({ amountMinorMyr: row.amount_minor_myr }));
  }

  async getProviderLimit(providerName: string): Promise<ProviderLimitState | null> {
    const row = await this.db.prepare(`
      SELECT provider, retention_mode, daily_budget, used_today, concurrency_limit, health_status, failure_count
      FROM provider_limits
      WHERE provider = ?
    `).bind(providerName).first<ProviderLimitRow>();
    if (!row) return null;
    return {
      providerName: row.provider,
      retentionMode: row.retention_mode,
      dailyBudget: row.daily_budget,
      usedToday: row.used_today,
      concurrencyLimit: row.concurrency_limit,
      healthStatus: row.health_status,
      failureCount: row.failure_count ?? 0
    };
  }

  async createSearchJob(job: PlannedSearchJob): Promise<void> {
    await this.db.prepare(`
      INSERT INTO search_jobs (
        id, origin_iata, destination_iata, departure_date, return_date,
        stay_length_days, cabin_class, adult_count, adults, provider,
        provider_name, status, priority, queued_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      job.id,
      job.originIata,
      job.destinationIata,
      job.departureDate,
      job.returnDate,
      job.stayLengthDays,
      job.cabinClass,
      job.adults,
      job.adults,
      job.providerName,
      job.providerName,
      job.status,
      job.prioritySource === "watchlist" ? 0 : job.prioritySource === "previous_deal" ? 10 : job.prioritySource === "popular_seed" ? 20 : 30,
      job.queuedAt
    ).run();
  }

  async updateSearchJob(jobId: string, update: SearchJobUpdate): Promise<void> {
    await this.db.prepare(`
      UPDATE search_jobs
      SET status = ?,
          started_at = COALESCE(?, started_at),
          completed_at = COALESCE(?, completed_at),
          finished_at = COALESCE(?, finished_at),
          error_code = ?,
          error_message = ?
      WHERE id = ?
    `).bind(
      update.status,
      update.startedAt ?? null,
      update.completedAt ?? null,
      update.completedAt ?? null,
      update.errorCode ?? null,
      update.errorMessage ?? null,
      jobId
    ).run();
  }

  async incrementProviderUsage(providerName: string, amount: number, at: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO provider_limits (provider, daily_budget, used_today, concurrency_limit, health_status, updated_at)
      VALUES (?, 0, ?, 1, 'available', ?)
      ON CONFLICT(provider) DO UPDATE SET
        used_today = used_today + excluded.used_today,
        updated_at = excluded.updated_at
    `).bind(providerName, amount, at).run();
  }

  async recordProviderFailure(providerName: string, at: string, threshold: number): Promise<void> {
    await this.db.prepare(`
      INSERT INTO provider_limits (provider, daily_budget, used_today, concurrency_limit, health_status, failure_count, last_failure_at, updated_at)
      VALUES (?, 0, 0, 1, 'degraded', 1, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        failure_count = failure_count + 1,
        last_failure_at = excluded.last_failure_at,
        health_status = CASE
          WHEN failure_count + 1 >= ? THEN 'degraded'
          ELSE health_status
        END,
        updated_at = excluded.updated_at
    `).bind(providerName, at, at, threshold).run();
  }

  async recordProviderSuccess(providerName: string, at: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO provider_limits (provider, daily_budget, used_today, concurrency_limit, health_status, failure_count, updated_at)
      VALUES (?, 0, 0, 1, 'healthy', 0, ?)
      ON CONFLICT(provider) DO UPDATE SET
        health_status = 'healthy',
        failure_count = 0,
        updated_at = excluded.updated_at
    `).bind(providerName, at).run();
  }

  async insertFareCheck(record: PersistedFareCheck): Promise<void> {
    await this.db.prepare(`
      INSERT INTO fare_checks (
        id, search_job_id, provider, provider_offer_id, origin_iata,
        destination_iata, departure_date, return_date, cabin_class,
        adult_count, amount_minor_myr, currency, total_stops,
        duration_minutes, carriers_json, self_transfer, retention_mode,
        is_revalidated, checked_at, last_revalidated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'economy', 1, ?, 'MYR', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      record.id,
      record.searchJobId,
      record.provider,
      record.providerOfferId,
      record.originIata,
      record.destinationIata,
      record.departureDate,
      record.returnDate,
      record.amountMinorMyr,
      record.totalStops,
      record.durationMinutes,
      JSON.stringify(record.carriers),
      record.selfTransfer ? 1 : 0,
      record.retentionMode,
      record.isRevalidated ? 1 : 0,
      record.checkedAt,
      record.lastRevalidatedAt ?? null,
      record.expiresAt ?? null
    ).run();
  }

  async insertFareSnapshot(record: PersistedFareSnapshot): Promise<void> {
    await this.db.prepare(`
      INSERT INTO fare_snapshots (
        id, provider, origin_iata, destination_iata, departure_date,
        return_date, stay_length_days, cabin_class, amount_minor_myr,
        observed_at, retention_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'economy', ?, ?, ?)
    `).bind(
      record.id,
      record.provider,
      record.originIata,
      record.destinationIata,
      record.departureDate,
      record.returnDate,
      record.stayLengthDays,
      record.amountMinorMyr,
      record.observedAt,
      record.retentionMode
    ).run();
  }

  async insertDealScore(record: PersistedDealScore): Promise<void> {
    await this.db.prepare(`
      INSERT INTO deal_scores (
        id, fare_check_id, amount_minor_myr, baseline_median_minor_myr,
        historical_p10_minor_myr, sample_size, discount_pct, score,
        deal_label, alert_eligible, reasons_json, scored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      record.id,
      record.fareCheckId,
      record.amountMinorMyr,
      record.baselineMedianMinorMyr,
      record.historicalP10MinorMyr,
      record.sampleSize,
      record.discountPct,
      record.score,
      record.dealLabel,
      record.alertEligible ? 1 : 0,
      JSON.stringify(record.reasons),
      record.scoredAt
    ).run();
  }

  async markRouteScanned(route: PlannedSearchJob, at: string): Promise<void> {
    await this.db.prepare(`
      UPDATE route_candidates
      SET last_scanned_at = ?, updated_at = ?
      WHERE origin_iata = ? AND destination_iata = ?
    `).bind(at, at, route.originIata, route.destinationIata).run();
  }
}

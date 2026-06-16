import type { PersistedAlertRecord, SentAlertLookupRecord } from "../alerts/types.ts";
import { formatMyrFromMinor } from "../scoring/statistics.ts";
import type { HistoricalFareSample } from "../scoring/types.ts";
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
import type {
  DemoProviderLimitRecord,
  DemoRouteCandidate,
  DemoState
} from "./demo-state.ts";

function routeKey(route: { originIata: string; destinationIata: string }): string {
  return `${route.originIata}|${route.destinationIata}`;
}

function airportApi(record: {
  iata_code: string;
  airport_name: string;
  city: string;
  country_code: string;
  region_group: string;
  active: boolean;
}): AirportApiRecord {
  return {
    iata_code: record.iata_code,
    airport_name: record.airport_name,
    city: record.city,
    country_code: record.country_code,
    region_group: record.region_group,
    active: record.active
  };
}

function toScanRoute(route: DemoRouteCandidate): ScanRouteCandidate {
  const output: ScanRouteCandidate = {
    originIata: route.originIata,
    destinationIata: route.destinationIata
  };
  if (route.countryCode) output.countryCode = route.countryCode;
  if (route.regionGroup) output.regionGroup = route.regionGroup;
  if (route.priority !== undefined) output.priority = route.priority;
  if (route.source) output.source = route.source;
  if (route.departureDate) output.departureDate = route.departureDate;
  if (route.returnDate) output.returnDate = route.returnDate;
  if (route.stayLengthDays !== undefined) output.stayLengthDays = route.stayLengthDays;
  if (route.prioritySource) output.prioritySource = route.prioritySource;
  return output;
}

function minutesBetween(later: Date, earlierIso: string | null | undefined): number {
  if (!earlierIso) return Number.POSITIVE_INFINITY;
  const earlier = Date.parse(earlierIso);
  if (!Number.isFinite(earlier)) return Number.POSITIVE_INFINITY;
  return (later.getTime() - earlier) / 60_000;
}

function warningFor(
  fareCheck: PersistedFareCheck,
  now: Date,
  freshWithinMinutes: number
): { warning: string | null; isLive: boolean } {
  const expiresAtMs = fareCheck.expiresAt ? Date.parse(fareCheck.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime()) {
    return { warning: "Expired offer. Do not treat as live fare.", isLive: false };
  }
  if (!fareCheck.isRevalidated || minutesBetween(now, fareCheck.lastRevalidatedAt) > freshWithinMinutes) {
    return { warning: "Stale fare. Revalidate before alert or purchase.", isLive: false };
  }
  return { warning: null, isLive: true };
}

function stayLengthDays(departureDate: string, returnDate: string): number {
  return Math.round((Date.parse(`${returnDate}T00:00:00.000Z`) - Date.parse(`${departureDate}T00:00:00.000Z`)) / 86_400_000);
}

function providerLimitApi(limit: DemoProviderLimitRecord): ProviderLimitApiRecord {
  return {
    provider_name: limit.providerName,
    retention_mode: limit.retentionMode,
    daily_budget: limit.dailyBudget,
    used_today: limit.usedToday,
    remaining_budget: Math.max(0, limit.dailyBudget - limit.usedToday),
    health_status: limit.healthStatus,
    last_success_at: limit.lastSuccessAt,
    last_failure_at: limit.lastFailureAt,
    failure_count: limit.failureCount
  };
}

function defaultProviderLimit(providerName: string, at: string): DemoProviderLimitRecord {
  return {
    providerName,
    retentionMode: providerName === "mock" ? "RAW_ALLOWED" : "NO_CACHE",
    dailyBudget: 50,
    usedToday: 0,
    concurrencyLimit: 1,
    healthStatus: "available",
    failureCount: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    updatedAt: at
  };
}

interface InternalDealApiRecord extends DealApiRecord {
  country_code: string;
  region_group: string;
}

function comparablePrice(row: PriceCalendarApiRecord): number {
  return row.amount_minor_myr ?? Number.POSITIVE_INFINITY;
}

function compareNumber(left: number | null, right: number | null, direction: 1 | -1): number {
  const leftValue = left ?? Number.POSITIVE_INFINITY;
  const rightValue = right ?? Number.POSITIVE_INFINITY;
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -direction : direction;
}

function sortCalendarRows(left: PriceCalendarApiRecord, right: PriceCalendarApiRecord, filters: PriceCalendarFilters): number {
  const direction: 1 | -1 = filters.sort_order === "desc" ? -1 : 1;
  if (filters.sort_by === "departure_date") {
    return direction * left.departure_date.localeCompare(right.departure_date) ||
      comparablePrice(left) - comparablePrice(right) ||
      compareNumber(left.stops, right.stops, 1);
  }
  if (filters.sort_by === "duration") {
    return compareNumber(left.total_duration_minutes, right.total_duration_minutes, direction) ||
      comparablePrice(left) - comparablePrice(right) ||
      compareNumber(left.stops, right.stops, 1);
  }
  if (filters.sort_by === "stops") {
    return compareNumber(left.stops, right.stops, direction) ||
      comparablePrice(left) - comparablePrice(right) ||
      compareNumber(left.total_duration_minutes, right.total_duration_minutes, 1);
  }
  return direction * (comparablePrice(left) - comparablePrice(right)) ||
    compareNumber(left.stops, right.stops, 1) ||
    compareNumber(left.total_duration_minutes, right.total_duration_minutes, 1) ||
    left.departure_date.localeCompare(right.departure_date);
}

export class DemoRepository implements ApiRepository, ScanRepository {
  readonly state: DemoState;

  constructor(state: DemoState) {
    this.state = state;
  }

  async listOrigins(): Promise<AirportApiRecord[]> {
    return this.state.airports
      .filter((airport) => airport.is_origin && airport.active)
      .sort((left, right) => left.iata_code.localeCompare(right.iata_code))
      .map(airportApi);
  }

  async listDestinations(filters: DestinationFilters): Promise<AirportApiRecord[]> {
    return this.state.airports
      .filter((airport) => !airport.is_origin && airport.active)
      .filter((airport) => {
        if (filters.country_code && airport.country_code !== filters.country_code) return false;
        if (filters.region_group && airport.region_group !== filters.region_group) return false;
        if (filters.origin_iata) {
          return this.state.routeCandidates.some((route) =>
            route.active &&
            route.originIata === filters.origin_iata &&
            route.destinationIata === airport.iata_code
          );
        }
        return true;
      })
      .sort((left, right) => left.country_code.localeCompare(right.country_code) || left.iata_code.localeCompare(right.iata_code))
      .map(airportApi);
  }

  async listDeals(filters: DealFilters, now: Date, freshWithinMinutes: number): Promise<DealApiRecord[]> {
    const deals = this.state.dealScores
      .map((score): InternalDealApiRecord | null => {
        const fareCheck = this.state.fareChecks.find((record) => record.id === score.fareCheckId);
        if (!fareCheck) return null;
        const destination = this.state.airports.find((airport) => airport.iata_code === fareCheck.destinationIata);
        if (!destination) return null;
        const freshness = warningFor(fareCheck, now, freshWithinMinutes);
        return {
          origin: fareCheck.originIata,
          destination: fareCheck.destinationIata,
          departure_date: fareCheck.departureDate,
          return_date: fareCheck.returnDate,
          stay_length_days: stayLengthDays(fareCheck.departureDate, fareCheck.returnDate),
          amount_minor_myr: fareCheck.amountMinorMyr,
          display_price_rm: `RM${formatMyrFromMinor(fareCheck.amountMinorMyr) ?? "0.00"}`,
          baseline_median_minor_myr: score.baselineMedianMinorMyr,
          historical_p10_minor_myr: score.historicalP10MinorMyr,
          discount_pct: score.discountPct,
          deal_score: score.score,
          deal_label: score.dealLabel,
          carrier: fareCheck.carriers.join(", "),
          stops: fareCheck.totalStops,
          total_duration_minutes: fareCheck.durationMinutes,
          provider_name: fareCheck.provider,
          last_revalidated_at: fareCheck.lastRevalidatedAt ?? null,
          expires_at: fareCheck.expiresAt ?? null,
          alert_status: this.state.alerts.find((alert) => alert.dealScoreId === score.id)?.status ?? null,
          warning: freshness.warning,
          is_live: freshness.isLive,
          country_code: destination.country_code,
          region_group: destination.region_group
        };
      })
      .filter((deal): deal is InternalDealApiRecord => deal !== null)
      .filter((deal) => {
        if (filters.origin_iata && deal.origin !== filters.origin_iata) return false;
        if (filters.destination_iata && deal.destination !== filters.destination_iata) return false;
        if (filters.country_code && deal.country_code !== filters.country_code) return false;
        if (filters.region_group && deal.region_group !== filters.region_group) return false;
        if (filters.deal_label && deal.deal_label !== filters.deal_label) return false;
        if (filters.min_score !== undefined && deal.deal_score < filters.min_score) return false;
        if (filters.max_stops !== undefined && deal.stops > filters.max_stops) return false;
        if (filters.departure_from && deal.departure_date < filters.departure_from) return false;
        if (filters.departure_to && deal.departure_date > filters.departure_to) return false;
        if (filters.provider_name && deal.provider_name !== filters.provider_name) return false;
        if (filters.only_alert_eligible && deal.deal_score < 70) return false;
        if (filters.stay_length_days !== undefined && deal.stay_length_days !== filters.stay_length_days) return false;
        if (filters.min_stay_length_days !== undefined && deal.stay_length_days < filters.min_stay_length_days) return false;
        if (filters.max_stay_length_days !== undefined && deal.stay_length_days > filters.max_stay_length_days) return false;
        if (filters.only_recently_verified && !deal.is_live) return false;
        return true;
      })
      .sort((left, right) => right.deal_score - left.deal_score || left.destination.localeCompare(right.destination))
      .slice(0, 100);

    return deals.map(({ country_code: _countryCode, region_group: _regionGroup, ...deal }) => deal);
  }

  async listPriceHistory(filters: PriceHistoryFilters): Promise<PriceHistoryApiRecord[]> {
    return this.state.fareSnapshots
      .filter((snapshot) => {
        if (filters.origin_iata && snapshot.originIata !== filters.origin_iata) return false;
        if (filters.destination_iata && snapshot.destinationIata !== filters.destination_iata) return false;
        if (filters.provider_name && snapshot.provider !== filters.provider_name) return false;
        if (filters.departure_from && snapshot.departureDate < filters.departure_from) return false;
        if (filters.departure_to && snapshot.departureDate > filters.departure_to) return false;
        return true;
      })
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
      .slice(0, 200)
      .map((snapshot) => ({
        origin: snapshot.originIata,
        destination: snapshot.destinationIata,
        departure_date: snapshot.departureDate,
        return_date: snapshot.returnDate,
        provider: snapshot.provider,
        amount_minor_myr: snapshot.amountMinorMyr,
        retrieved_at: snapshot.observedAt,
        revalidated_at: this.latestRevalidationFor(snapshot)
      }));
  }

  async listPriceCalendar(filters: PriceCalendarFilters, now: Date): Promise<PriceCalendarApiRecord[]> {
    return (this.state.priceCalendarRows ?? [])
      .map((row) => {
        const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
        return {
          ...row,
          freshness_label: Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime()
            ? "expired"
            : row.freshness_label,
          is_live: false as const,
          is_bookable_claim: false as const
        };
      })
      .filter((row) => {
        if (filters.origin_iata && row.origin_iata !== filters.origin_iata) return false;
        if (filters.destination_iata && row.destination_iata !== filters.destination_iata) return false;
        if (filters.destination_region && row.destination_region !== filters.destination_region) return false;
        if (filters.destination_country && row.destination_country !== filters.destination_country) return false;
        if (filters.departure_from && row.departure_date < filters.departure_from) return false;
        if (filters.departure_to && row.departure_date > filters.departure_to) return false;
        if (filters.stay_length_days !== undefined && row.stay_length_days !== filters.stay_length_days) return false;
        if (filters.cabin_class && row.cabin_class !== filters.cabin_class) return false;
        if (filters.adults !== undefined && row.adults !== filters.adults) return false;
        if (filters.max_stops !== undefined && (row.stops ?? 99) > filters.max_stops) return false;
        if (filters.freshness && row.freshness_label !== filters.freshness) return false;
        if (!filters.include_expired && row.freshness_label === "expired") return false;
        return true;
      })
      .sort((left, right) => sortCalendarRows(left, right, filters))
      .slice(0, 200);
  }

  async listProviderLimits(): Promise<ProviderLimitApiRecord[]> {
    return this.state.providerLimits
      .map(providerLimitApi)
      .sort((left, right) => left.provider_name.localeCompare(right.provider_name));
  }

  async listWatchlistRoutes(): Promise<ScanRouteCandidate[]> {
    return [];
  }

  async listPreviousDealRoutes(): Promise<ScanRouteCandidate[]> {
    const bestByRoute = new Map<string, { route: ScanRouteCandidate; score: number }>();
    for (const dealScore of this.state.dealScores) {
      if (dealScore.dealLabel !== "strong_deal" && dealScore.dealLabel !== "suspected_deal") continue;
      const fareCheck = this.state.fareChecks.find((record) => record.id === dealScore.fareCheckId);
      if (!fareCheck) continue;
      const destination = this.state.airports.find((airport) => airport.iata_code === fareCheck.destinationIata);
      const candidate: ScanRouteCandidate = {
        originIata: fareCheck.originIata,
        destinationIata: fareCheck.destinationIata,
        priority: 20 - dealScore.score,
        source: "previous_deal",
        departureDate: fareCheck.departureDate,
        returnDate: fareCheck.returnDate,
        stayLengthDays: stayLengthDays(fareCheck.departureDate, fareCheck.returnDate)
      };
      if (destination?.country_code) candidate.countryCode = destination.country_code;
      if (destination?.region_group) candidate.regionGroup = destination.region_group;
      const key = routeKey(candidate);
      const existing = bestByRoute.get(key);
      if (!existing || dealScore.score > existing.score) {
        bestByRoute.set(key, { route: candidate, score: dealScore.score });
      }
    }
    return [...bestByRoute.values()]
      .sort((left, right) => right.score - left.score || routeKey(left.route).localeCompare(routeKey(right.route)))
      .map((entry) => entry.route);
  }

  async listPopularSeedRoutes(): Promise<ScanRouteCandidate[]> {
    return this.state.routeCandidates
      .filter((route) => route.active && route.source === "seed")
      .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100) || routeKey(left).localeCompare(routeKey(right)))
      .map(toScanRoute);
  }

  async listExplorationRoutes(): Promise<ScanRouteCandidate[]> {
    return this.state.routeCandidates
      .filter((route) => route.active)
      .sort((left, right) =>
        (left.lastScannedAt ?? "1970-01-01T00:00:00.000Z").localeCompare(right.lastScannedAt ?? "1970-01-01T00:00:00.000Z") ||
        routeKey(left).localeCompare(routeKey(right))
      )
      .map((route) => ({ ...toScanRoute(route), source: "exploration" }));
  }

  async getHistoricalSamples(route: PlannedSearchJob): Promise<HistoricalFareSample[]> {
    return this.state.fareSnapshots
      .filter((snapshot) =>
        snapshot.originIata === route.originIata &&
        snapshot.destinationIata === route.destinationIata &&
        snapshot.stayLengthDays === route.stayLengthDays
      )
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
      .slice(0, 180)
      .map((snapshot) => ({
        amountMinorMyr: snapshot.amountMinorMyr,
        observedAt: snapshot.observedAt
      }));
  }

  async getProviderLimit(providerName: string): Promise<ProviderLimitState | null> {
    const limit = this.providerLimit(providerName);
    return {
      providerName: limit.providerName,
      retentionMode: limit.retentionMode,
      dailyBudget: limit.dailyBudget,
      usedToday: limit.usedToday,
      concurrencyLimit: limit.concurrencyLimit,
      healthStatus: limit.healthStatus,
      failureCount: limit.failureCount
    };
  }

  async createSearchJob(job: PlannedSearchJob): Promise<void> {
    this.state.searchJobs.push({
      ...job,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null
    });
  }

  async updateSearchJob(jobId: string, update: SearchJobUpdate): Promise<void> {
    const job = this.state.searchJobs.find((record) => record.id === jobId);
    if (!job) return;
    job.status = update.status;
    if (update.startedAt !== undefined) job.startedAt = update.startedAt;
    if (update.completedAt !== undefined) job.completedAt = update.completedAt;
    job.errorCode = update.errorCode ?? null;
    job.errorMessage = update.errorMessage ?? null;
  }

  async incrementProviderUsage(providerName: string, amount: number, at: string): Promise<void> {
    const limit = this.providerLimit(providerName);
    limit.usedToday += amount;
    limit.updatedAt = at;
  }

  async recordProviderFailure(providerName: string, at: string, threshold: number): Promise<void> {
    const limit = this.providerLimit(providerName);
    limit.failureCount += 1;
    limit.lastFailureAt = at;
    limit.updatedAt = at;
    if (limit.failureCount >= threshold) {
      limit.healthStatus = "degraded";
    }
  }

  async recordProviderSuccess(providerName: string, at: string): Promise<void> {
    const limit = this.providerLimit(providerName);
    limit.failureCount = 0;
    limit.healthStatus = "healthy";
    limit.lastSuccessAt = at;
    limit.updatedAt = at;
  }

  async insertFareCheck(record: PersistedFareCheck): Promise<void> {
    this.state.fareChecks.push(record);
  }

  async insertFareSnapshot(record: PersistedFareSnapshot): Promise<void> {
    this.state.fareSnapshots.push(record);
  }

  async insertDealScore(record: PersistedDealScore): Promise<void> {
    this.state.dealScores.push(record);
  }

  async listRecentAlertsForDedupe(input: {
    originIata: string;
    destinationIata: string;
    departureDate: string;
    returnDate: string;
    provider: string;
    dealLabel: SentAlertLookupRecord["dealLabel"];
  }): Promise<SentAlertLookupRecord[]> {
    return this.state.alerts
      .filter((alert) =>
        alert.status === "sent" &&
        alert.originIata === input.originIata &&
        alert.destinationIata === input.destinationIata &&
        alert.departureDate === input.departureDate &&
        alert.returnDate === input.returnDate &&
        alert.provider === input.provider &&
        alert.dealLabel === input.dealLabel
      )
      .map((alert) => ({
        originIata: alert.originIata,
        destinationIata: alert.destinationIata,
        departureDate: alert.departureDate,
        returnDate: alert.returnDate,
        provider: alert.provider,
        dealLabel: alert.dealLabel,
        sentAt: alert.sentAt
      }));
  }

  async insertAlert(record: PersistedAlertRecord): Promise<void> {
    this.state.alerts.push(record);
  }

  async markRouteScanned(route: PlannedSearchJob, at: string): Promise<void> {
    const candidate = this.state.routeCandidates.find((record) =>
      record.originIata === route.originIata &&
      record.destinationIata === route.destinationIata
    );
    if (candidate) {
      candidate.lastScannedAt = at;
    }
  }

  private latestRevalidationFor(snapshot: PersistedFareSnapshot): string | null {
    return this.state.fareChecks
      .filter((check) =>
        check.originIata === snapshot.originIata &&
        check.destinationIata === snapshot.destinationIata &&
        check.departureDate === snapshot.departureDate &&
        check.returnDate === snapshot.returnDate &&
        check.provider === snapshot.provider
      )
      .map((check) => check.lastRevalidatedAt ?? null)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;
  }

  private providerLimit(providerName: string): DemoProviderLimitRecord {
    let limit = this.state.providerLimits.find((record) => record.providerName === providerName);
    if (!limit) {
      limit = defaultProviderLimit(providerName, this.state.clock.nowIso);
      this.state.providerLimits.push(limit);
    }
    return limit;
  }
}

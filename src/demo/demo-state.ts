import type { PersistedAlertRecord } from "../alerts/types.ts";
import type { AirportApiRecord, PriceCalendarApiRecord } from "../routes/api-types.ts";
import {
  destinationAirportSeeds,
  originAirportSeeds,
  type AirportSeed
} from "../seeds/airports.ts";
import type {
  PersistedDealScore,
  PersistedFareCheck,
  PersistedFareSnapshot,
  PlannedSearchJob,
  ProviderLimitState,
  RoutePrioritySource,
  ScanRouteCandidate,
  SearchJobStatus
} from "../scanner/types.ts";

export const DEMO_NOW_ISO = "2026-06-10T08:00:00.000Z";
export const DEMO_DEPARTURE_DATE = "2026-07-25";
export const DEMO_RETURN_DATE = "2026-07-30";
export const DEMO_STAY_LENGTH_DAYS = 5;

export interface DemoAirportRecord extends AirportApiRecord {
  is_origin: boolean;
}

export interface DemoRouteCandidate extends ScanRouteCandidate {
  active: boolean;
  lastScannedAt: string | null;
}

export interface DemoSearchJob extends PlannedSearchJob {
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface DemoProviderLimitRecord extends ProviderLimitState {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  updatedAt: string;
}

export interface DemoPriceCalendarRecord extends PriceCalendarApiRecord {
  id: string;
}

export interface DemoState {
  schemaVersion: 1;
  clock: {
    nowIso: string;
  };
  nextId: number;
  airports: DemoAirportRecord[];
  routeCandidates: DemoRouteCandidate[];
  searchJobs: DemoSearchJob[];
  fareChecks: PersistedFareCheck[];
  fareSnapshots: PersistedFareSnapshot[];
  priceCalendarRows: DemoPriceCalendarRecord[];
  dealScores: PersistedDealScore[];
  alerts: PersistedAlertRecord[];
  providerLimits: DemoProviderLimitRecord[];
}

function airport(seed: AirportSeed): DemoAirportRecord {
  return {
    iata_code: seed.iata_code,
    airport_name: seed.airport_name,
    city: seed.city,
    country_code: seed.country_code,
    region_group: seed.region_group,
    active: seed.active,
    is_origin: seed.is_origin
  };
}

function destinationLookup(): Map<string, AirportSeed> {
  return new Map(destinationAirportSeeds.map((seed) => [seed.iata_code, seed]));
}

function route(
  originIata: string,
  destinationIata: string,
  priority: number,
  source: RoutePrioritySource = "popular_seed"
): DemoRouteCandidate {
  const destination = destinationLookup().get(destinationIata);
  if (!destination) {
    throw new Error(`Unknown demo destination ${destinationIata}`);
  }
  return {
    originIata,
    destinationIata,
    countryCode: destination.country_code,
    regionGroup: destination.region_group,
    priority,
    source: source === "popular_seed" ? "seed" : source,
    prioritySource: source,
    active: true,
    departureDate: DEMO_DEPARTURE_DATE,
    returnDate: DEMO_RETURN_DATE,
    stayLengthDays: DEMO_STAY_LENGTH_DAYS,
    lastScannedAt: null
  };
}

function baselineSamples(lowMinor: number, medianMinor: number): number[] {
  return [
    lowMinor,
    lowMinor,
    ...Array.from({ length: 18 }, () => medianMinor)
  ];
}

function historicalSnapshots(input: {
  originIata: string;
  destinationIata: string;
  samples: number[];
  idPrefix: string;
}): PersistedFareSnapshot[] {
  return input.samples.map((amountMinorMyr, index) => {
    const observedAt = new Date(Date.parse(DEMO_NOW_ISO) - (index + 1) * 86_400_000).toISOString();
    return {
      id: `${input.idPrefix}-${String(index + 1).padStart(2, "0")}`,
      provider: "demo_seed",
      originIata: input.originIata,
      destinationIata: input.destinationIata,
      departureDate: DEMO_DEPARTURE_DATE,
      returnDate: DEMO_RETURN_DATE,
      stayLengthDays: DEMO_STAY_LENGTH_DAYS,
      amountMinorMyr,
      observedAt,
      retentionMode: "AGGREGATE_ONLY",
      rawPayloadStored: false
    };
  });
}

function destinationMeta(destinationIata: string): { country: string; region: string } {
  const destination = destinationLookup().get(destinationIata);
  if (!destination) throw new Error(`Unknown demo destination ${destinationIata}`);
  return {
    country: destination.country_code,
    region: destination.region_group
  };
}

function calendarRow(input: {
  id: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  amountMinorMyr: number;
  airlineIata: string;
  flightNumber: string;
  stops: number;
  totalDurationMinutes: number;
  retrievedAt: string;
  expiresAt?: string | null;
  freshnessLabel: DemoPriceCalendarRecord["freshness_label"];
  sourceEndpoint?: string;
}): DemoPriceCalendarRecord {
  const destination = destinationMeta(input.destinationIata);
  return {
    id: input.id,
    origin_iata: "KUL",
    destination_iata: input.destinationIata,
    destination_country: destination.country,
    destination_region: destination.region,
    departure_date: input.departureDate,
    return_date: input.returnDate,
    stay_length_days: Math.round((Date.parse(`${input.returnDate}T00:00:00.000Z`) - Date.parse(`${input.departureDate}T00:00:00.000Z`)) / 86_400_000),
    trip_type: "round_trip",
    cabin_class: "economy",
    adults: 1,
    amount_minor_myr: input.amountMinorMyr,
    display_price_rm: `RM${(input.amountMinorMyr / 100).toFixed(2)}`,
    original_amount: input.amountMinorMyr / 100,
    original_currency: "MYR",
    airline_iata: input.airlineIata,
    flight_number: input.flightNumber,
    stops: input.stops,
    total_duration_minutes: input.totalDurationMinutes,
    provider_name: "travelpayouts_demo",
    source_endpoint: input.sourceEndpoint ?? "demo_seed",
    retrieved_at: input.retrievedAt,
    expires_at: input.expiresAt ?? null,
    freshness_label: input.freshnessLabel,
    is_live: false,
    is_bookable_claim: false,
    search_link: `https://www.aviasales.com/search/KUL${input.departureDate.replaceAll("-", "").slice(2)}${input.destinationIata}${input.returnDate.replaceAll("-", "").slice(2)}1`,
    warning: "Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.",
    deal_label: null,
    deal_score: null
  };
}

function demoPriceCalendarRows(): DemoPriceCalendarRecord[] {
  const retrievedFresh = DEMO_NOW_ISO;
  const retrievedRecent = "2026-06-09T10:00:00.000Z";
  const retrievedCached = "2026-06-06T08:00:00.000Z";
  return [
    calendarRow({ id: "calendar-demo-001", destinationIata: "TPE", departureDate: "2026-07-25", returnDate: "2026-07-30", amountMinorMyr: 45900, airlineIata: "D7", flightNumber: "376", stops: 0, totalDurationMinutes: 280, retrievedAt: retrievedFresh, freshnessLabel: "fresh", sourceEndpoint: "v2/prices/latest" }),
    calendarRow({ id: "calendar-demo-002", destinationIata: "TPE", departureDate: "2026-08-02", returnDate: "2026-08-07", amountMinorMyr: 48800, airlineIata: "OD", flightNumber: "882", stops: 0, totalDurationMinutes: 285, retrievedAt: retrievedRecent, freshnessLabel: "recent", sourceEndpoint: "v2/prices/month-matrix" }),
    calendarRow({ id: "calendar-demo-003", destinationIata: "TPE", departureDate: "2026-08-16", returnDate: "2026-08-21", amountMinorMyr: 53600, airlineIata: "CI", flightNumber: "722", stops: 0, totalDurationMinutes: 290, retrievedAt: retrievedCached, freshnessLabel: "cached", sourceEndpoint: "v2/prices/week-matrix" }),
    calendarRow({ id: "calendar-demo-004", destinationIata: "BKK", departureDate: "2026-07-25", returnDate: "2026-07-30", amountMinorMyr: 44100, airlineIata: "AK", flightNumber: "884", stops: 0, totalDurationMinutes: 135, retrievedAt: retrievedFresh, freshnessLabel: "fresh", sourceEndpoint: "v2/prices/latest" }),
    calendarRow({ id: "calendar-demo-005", destinationIata: "BKK", departureDate: "2026-08-01", returnDate: "2026-08-06", amountMinorMyr: 46300, airlineIata: "FD", flightNumber: "320", stops: 0, totalDurationMinutes: 140, retrievedAt: retrievedRecent, freshnessLabel: "recent" }),
    calendarRow({ id: "calendar-demo-006", destinationIata: "BKK", departureDate: "2026-08-22", returnDate: "2026-08-27", amountMinorMyr: 51200, airlineIata: "MH", flightNumber: "782", stops: 0, totalDurationMinutes: 145, retrievedAt: retrievedCached, freshnessLabel: "cached" }),
    calendarRow({ id: "calendar-demo-007", destinationIata: "SIN", departureDate: "2026-07-26", returnDate: "2026-07-31", amountMinorMyr: 35800, airlineIata: "AK", flightNumber: "701", stops: 0, totalDurationMinutes: 70, retrievedAt: retrievedFresh, freshnessLabel: "fresh" }),
    calendarRow({ id: "calendar-demo-008", destinationIata: "SIN", departureDate: "2026-08-09", returnDate: "2026-08-14", amountMinorMyr: 40200, airlineIata: "TR", flightNumber: "469", stops: 0, totalDurationMinutes: 75, retrievedAt: retrievedRecent, freshnessLabel: "recent" }),
    calendarRow({ id: "calendar-demo-009", destinationIata: "SIN", departureDate: "2026-08-23", returnDate: "2026-08-28", amountMinorMyr: 43100, airlineIata: "SQ", flightNumber: "105", stops: 0, totalDurationMinutes: 75, retrievedAt: retrievedCached, freshnessLabel: "cached" }),
    calendarRow({ id: "calendar-demo-010", destinationIata: "NRT", departureDate: "2026-07-25", returnDate: "2026-07-30", amountMinorMyr: 78900, airlineIata: "D7", flightNumber: "522", stops: 0, totalDurationMinutes: 430, retrievedAt: retrievedFresh, freshnessLabel: "fresh" }),
    calendarRow({ id: "calendar-demo-011", destinationIata: "NRT", departureDate: "2026-08-04", returnDate: "2026-08-09", amountMinorMyr: 83600, airlineIata: "VN", flightNumber: "676", stops: 1, totalDurationMinutes: 610, retrievedAt: retrievedRecent, freshnessLabel: "recent" }),
    calendarRow({ id: "calendar-demo-012", destinationIata: "NRT", departureDate: "2026-08-18", returnDate: "2026-08-23", amountMinorMyr: 91800, airlineIata: "PR", flightNumber: "526", stops: 1, totalDurationMinutes: 650, retrievedAt: retrievedCached, freshnessLabel: "cached" }),
    calendarRow({ id: "calendar-demo-013", destinationIata: "KIX", departureDate: "2026-07-28", returnDate: "2026-08-02", amountMinorMyr: 74200, airlineIata: "D7", flightNumber: "533", stops: 0, totalDurationMinutes: 405, retrievedAt: retrievedFresh, freshnessLabel: "fresh" }),
    calendarRow({ id: "calendar-demo-014", destinationIata: "KIX", departureDate: "2026-08-11", returnDate: "2026-08-16", amountMinorMyr: 79800, airlineIata: "VJ", flightNumber: "826", stops: 1, totalDurationMinutes: 590, retrievedAt: retrievedRecent, freshnessLabel: "recent" }),
    calendarRow({ id: "calendar-demo-015", destinationIata: "KIX", departureDate: "2026-08-25", returnDate: "2026-08-30", amountMinorMyr: 86900, airlineIata: "MU", flightNumber: "8642", stops: 1, totalDurationMinutes: 615, retrievedAt: retrievedCached, freshnessLabel: "cached" }),
    calendarRow({ id: "calendar-demo-016", destinationIata: "PVG", departureDate: "2026-07-27", returnDate: "2026-08-01", amountMinorMyr: 61200, airlineIata: "MU", flightNumber: "8642", stops: 0, totalDurationMinutes: 330, retrievedAt: retrievedFresh, freshnessLabel: "fresh" }),
    calendarRow({ id: "calendar-demo-017", destinationIata: "PVG", departureDate: "2026-08-10", returnDate: "2026-08-15", amountMinorMyr: 66400, airlineIata: "CZ", flightNumber: "350", stops: 1, totalDurationMinutes: 455, retrievedAt: retrievedRecent, freshnessLabel: "recent" }),
    calendarRow({ id: "calendar-demo-018", destinationIata: "PVG", departureDate: "2026-08-24", returnDate: "2026-08-29", amountMinorMyr: 72500, airlineIata: "MF", flightNumber: "848", stops: 1, totalDurationMinutes: 520, retrievedAt: retrievedCached, freshnessLabel: "cached" }),
    calendarRow({ id: "calendar-demo-019", destinationIata: "CAN", departureDate: "2026-07-29", returnDate: "2026-08-03", amountMinorMyr: 55200, airlineIata: "CZ", flightNumber: "8072", stops: 0, totalDurationMinutes: 245, retrievedAt: retrievedFresh, freshnessLabel: "fresh" }),
    calendarRow({ id: "calendar-demo-020", destinationIata: "CAN", departureDate: "2026-08-12", returnDate: "2026-08-17", amountMinorMyr: 58900, airlineIata: "AK", flightNumber: "112", stops: 0, totalDurationMinutes: 250, retrievedAt: retrievedRecent, freshnessLabel: "recent" }),
    calendarRow({ id: "calendar-demo-021", destinationIata: "CAN", departureDate: "2026-06-01", returnDate: "2026-06-06", amountMinorMyr: 59900, airlineIata: "CZ", flightNumber: "366", stops: 0, totalDurationMinutes: 250, retrievedAt: "2026-05-20T08:00:00.000Z", expiresAt: "2026-06-01T00:00:00.000Z", freshnessLabel: "expired" })
  ];
}

export function createSeededDemoState(nowIso = DEMO_NOW_ISO): DemoState {
  const routeCandidates = [
    route("KUL", "BKK", 1),
    route("KUL", "TPE", 2),
    route("KUL", "SIN", 3),
    route("JHB", "BKK", 4),
    route("SZB", "NRT", 5)
  ];

  const fareSnapshots = [
    ...historicalSnapshots({
      originIata: "KUL",
      destinationIata: "BKK",
      idPrefix: "hist-kul-bkk",
      samples: baselineSamples(50_000, 63_000)
    }),
    ...historicalSnapshots({
      originIata: "KUL",
      destinationIata: "TPE",
      idPrefix: "hist-kul-tpe",
      samples: baselineSamples(44_000, 58_000)
    }),
    ...historicalSnapshots({
      originIata: "KUL",
      destinationIata: "SIN",
      idPrefix: "hist-kul-sin",
      samples: baselineSamples(44_000, 50_000)
    }),
    ...historicalSnapshots({
      originIata: "JHB",
      destinationIata: "BKK",
      idPrefix: "hist-jhb-bkk",
      samples: baselineSamples(42_000, 55_000)
    }),
    ...historicalSnapshots({
      originIata: "SZB",
      destinationIata: "NRT",
      idPrefix: "hist-szb-nrt",
      samples: baselineSamples(55_000, 70_000)
    })
  ];

  return {
    schemaVersion: 1,
    clock: {
      nowIso
    },
    nextId: 1,
    airports: [...originAirportSeeds, ...destinationAirportSeeds].map(airport),
    routeCandidates,
    searchJobs: [],
    fareChecks: [],
    fareSnapshots,
    priceCalendarRows: demoPriceCalendarRows(),
    dealScores: [],
    alerts: [],
    providerLimits: [
      {
        providerName: "mock",
        retentionMode: "RAW_ALLOWED",
        dailyBudget: 50,
        usedToday: 0,
        concurrencyLimit: 2,
        healthStatus: "available",
        failureCount: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        updatedAt: nowIso
      }
    ]
  };
}

export function demoIdFactory(state: DemoState): () => string {
  return () => {
    const id = `demo-${String(state.nextId).padStart(5, "0")}`;
    state.nextId += 1;
    return id;
  };
}

export function isSearchJobStatus(value: string): value is SearchJobStatus {
  return [
    "queued",
    "running",
    "succeeded",
    "failed",
    "skipped",
    "rate_limited",
    "provider_disabled"
  ].includes(value);
}

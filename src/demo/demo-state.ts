import type { PersistedAlertRecord } from "../alerts/types.ts";
import type { AirportApiRecord } from "../routes/api-types.ts";
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

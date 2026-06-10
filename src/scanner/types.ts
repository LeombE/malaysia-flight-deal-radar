import type { ProviderRetentionMode } from "../providers/types.ts";
import type { DealLabel, HistoricalFareSample } from "../scoring/types.ts";

export type RoutePrioritySource = "watchlist" | "previous_deal" | "popular_seed" | "exploration";

export type SearchJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "rate_limited"
  | "provider_disabled";

export interface ScanRouteCandidate {
  originIata: string;
  destinationIata: string;
  countryCode?: string;
  regionGroup?: string;
  priority?: number;
  source?: string;
  departureDate?: string;
  returnDate?: string;
  stayLengthDays?: number;
  prioritySource?: RoutePrioritySource;
}

export interface PlannedSearchJob {
  id: string;
  providerName: string;
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  stayLengthDays: number;
  cabinClass: "economy";
  adults: number;
  prioritySource: RoutePrioritySource;
  status: SearchJobStatus;
  queuedAt: string;
}

export interface ProviderLimitState {
  providerName: string;
  retentionMode: ProviderRetentionMode;
  dailyBudget: number;
  usedToday: number;
  concurrencyLimit: number;
  healthStatus: string;
  failureCount: number;
}

export interface PersistedFareCheck {
  id: string;
  searchJobId: string;
  provider: string;
  providerOfferId: string;
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  amountMinorMyr: number;
  totalStops: number;
  durationMinutes: number;
  carriers: string[];
  selfTransfer: boolean;
  retentionMode: ProviderRetentionMode;
  isRevalidated: boolean;
  checkedAt: string;
  lastRevalidatedAt?: string;
  expiresAt?: string;
  rawPayloadStored: boolean;
}

export interface PersistedFareSnapshot {
  id: string;
  provider: string;
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  stayLengthDays: number;
  amountMinorMyr: number;
  observedAt: string;
  retentionMode: ProviderRetentionMode;
  rawPayloadStored: boolean;
}

export interface PersistedDealScore {
  id: string;
  fareCheckId: string;
  amountMinorMyr: number;
  baselineMedianMinorMyr: number | null;
  historicalP10MinorMyr: number | null;
  sampleSize: number;
  discountPct: number;
  score: number;
  dealLabel: DealLabel;
  alertEligible: boolean;
  reasons: string[];
  scoredAt: string;
}

export interface SearchJobUpdate {
  status: SearchJobStatus;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ScanRepository {
  listWatchlistRoutes(): Promise<ScanRouteCandidate[]>;
  listPreviousDealRoutes(): Promise<ScanRouteCandidate[]>;
  listPopularSeedRoutes(): Promise<ScanRouteCandidate[]>;
  listExplorationRoutes(): Promise<ScanRouteCandidate[]>;
  getHistoricalSamples(route: PlannedSearchJob): Promise<HistoricalFareSample[]>;
  getProviderLimit(providerName: string): Promise<ProviderLimitState | null>;
  createSearchJob(job: PlannedSearchJob): Promise<void>;
  updateSearchJob(jobId: string, update: SearchJobUpdate): Promise<void>;
  incrementProviderUsage(providerName: string, amount: number, at: string): Promise<void>;
  recordProviderFailure(providerName: string, at: string, threshold: number): Promise<void>;
  recordProviderSuccess(providerName: string, at: string): Promise<void>;
  insertFareCheck(record: PersistedFareCheck): Promise<void>;
  insertFareSnapshot(record: PersistedFareSnapshot): Promise<void>;
  insertDealScore(record: PersistedDealScore): Promise<void>;
  markRouteScanned(route: PlannedSearchJob, at: string): Promise<void>;
}

export interface ScanRunResult {
  runId: string;
  jobsCreated: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsSkipped: number;
  offersSeen: number;
  fareChecksInserted: number;
  fareSnapshotsInserted: number;
  dealScoresInserted: number;
  revalidationsAttempted: number;
  providerBudgetUsed: number;
}

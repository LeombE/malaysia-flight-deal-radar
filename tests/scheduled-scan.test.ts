import test from "node:test";
import assert from "node:assert/strict";
import type { SchedulerConfig } from "../src/config/scheduler.ts";
import type { PersistedAlertRecord, SentAlertLookupRecord, TelegramSendResult } from "../src/alerts/types.ts";
import { MockProvider } from "../src/providers/mock-provider.ts";
import { createProviderRegistry } from "../src/providers/registry.ts";
import type {
  ProviderHealth,
  ProviderOffer,
  ProviderRetentionMode,
  RevalidateOfferInput,
  SearchRoundTripInput
} from "../src/providers/types.ts";
import { runScheduledScan } from "../src/scanner/scheduled-scan.ts";
import type {
  PersistedDealScore,
  PersistedFareCheck,
  PersistedFareSnapshot,
  PlannedSearchJob,
  ProviderLimitState,
  ScanRepository,
  ScanRouteCandidate,
  SearchJobUpdate
} from "../src/scanner/types.ts";
import type { HistoricalFareSample } from "../src/scoring/types.ts";

const NOW = new Date("2026-06-10T08:00:00.000Z");

const defaultConfig: SchedulerConfig = {
  maxSearchesPerCronRun: 50,
  maxProviderConcurrency: 3,
  providerDailyBudget: 50,
  revalidateBeforeAlertMinutes: 30,
  defaultStayLengthDays: 5,
  departureOffsetDays: 45,
  providerFailureDegradeThreshold: 2
};

function historicalSamples(): HistoricalFareSample[] {
  return [
    { amountMinorMyr: 60_000 },
    { amountMinorMyr: 60_000 },
    ...Array.from({ length: 18 }, () => ({ amountMinorMyr: 100_000 }))
  ];
}

class MemoryScanRepository implements ScanRepository {
  watchlistRoutes: ScanRouteCandidate[] = [];
  previousDealRoutes: ScanRouteCandidate[] = [];
  popularSeedRoutes: ScanRouteCandidate[] = [];
  explorationRoutes: ScanRouteCandidate[] = [];
  historicalSamples: HistoricalFareSample[] = historicalSamples();
  providerLimits = new Map<string, ProviderLimitState>();
  jobs: PlannedSearchJob[] = [];
  jobUpdates: Array<{ jobId: string; update: SearchJobUpdate }> = [];
  fareChecks: PersistedFareCheck[] = [];
  fareSnapshots: PersistedFareSnapshot[] = [];
  dealScores: PersistedDealScore[] = [];
  alerts: PersistedAlertRecord[] = [];
  previousAlerts: SentAlertLookupRecord[] = [];
  scannedRoutes: Array<{ route: PlannedSearchJob; at: string }> = [];

  async listWatchlistRoutes(): Promise<ScanRouteCandidate[]> {
    return this.watchlistRoutes;
  }

  async listPreviousDealRoutes(): Promise<ScanRouteCandidate[]> {
    return this.previousDealRoutes;
  }

  async listPopularSeedRoutes(): Promise<ScanRouteCandidate[]> {
    return this.popularSeedRoutes;
  }

  async listExplorationRoutes(): Promise<ScanRouteCandidate[]> {
    return this.explorationRoutes;
  }

  async getHistoricalSamples(): Promise<HistoricalFareSample[]> {
    return this.historicalSamples;
  }

  async getProviderLimit(providerName: string): Promise<ProviderLimitState | null> {
    return this.providerLimits.get(providerName) ?? null;
  }

  async createSearchJob(job: PlannedSearchJob): Promise<void> {
    this.jobs.push(job);
  }

  async updateSearchJob(jobId: string, update: SearchJobUpdate): Promise<void> {
    this.jobUpdates.push({ jobId, update });
  }

  async incrementProviderUsage(providerName: string, amount: number): Promise<void> {
    const limit = this.providerLimits.get(providerName);
    if (limit) {
      limit.usedToday += amount;
      this.providerLimits.set(providerName, limit);
    }
  }

  async recordProviderFailure(providerName: string, at: string, threshold: number): Promise<void> {
    const limit = this.providerLimits.get(providerName) ?? {
      providerName,
      retentionMode: "RAW_ALLOWED" as const,
      dailyBudget: 50,
      usedToday: 0,
      concurrencyLimit: 1,
      healthStatus: "available",
      failureCount: 0
    };
    limit.failureCount += 1;
    if (limit.failureCount >= threshold) {
      limit.healthStatus = "degraded";
    }
    this.providerLimits.set(providerName, limit);
    void at;
  }

  async recordProviderSuccess(providerName: string): Promise<void> {
    const limit = this.providerLimits.get(providerName);
    if (limit) {
      limit.healthStatus = "healthy";
      limit.failureCount = 0;
      this.providerLimits.set(providerName, limit);
    }
  }

  async insertFareCheck(record: PersistedFareCheck): Promise<void> {
    this.fareChecks.push(record);
  }

  async insertFareSnapshot(record: PersistedFareSnapshot): Promise<void> {
    this.fareSnapshots.push(record);
  }

  async insertDealScore(record: PersistedDealScore): Promise<void> {
    this.dealScores.push(record);
  }

  async listRecentAlertsForDedupe(): Promise<SentAlertLookupRecord[]> {
    return this.previousAlerts;
  }

  async insertAlert(record: PersistedAlertRecord): Promise<void> {
    this.alerts.push(record);
  }

  async markRouteScanned(route: PlannedSearchJob, at: string): Promise<void> {
    this.scannedRoutes.push({ route, at });
  }
}

class RecordingAlertSender {
  messages: string[] = [];
  private readonly result: TelegramSendResult;

  constructor(result: TelegramSendResult = { status: "sent", messageId: 1 }) {
    this.result = result;
  }

  async sendMessage(message: string): Promise<TelegramSendResult> {
    this.messages.push(message);
    return this.result;
  }
}

class RevalidatingMockProvider extends MockProvider {
  searchCalls = 0;
  revalidateCalls = 0;
  maxConcurrentSearches = 0;
  private activeSearches = 0;
  private readonly options: {
    enabled?: boolean;
    failSearch?: boolean;
    retentionMode?: ProviderRetentionMode;
    staleRevalidation?: boolean;
    priceMinor?: number;
    delaySearch?: () => Promise<void>;
  };

  constructor(options: {
    enabled?: boolean;
    failSearch?: boolean;
    retentionMode?: ProviderRetentionMode;
    staleRevalidation?: boolean;
    priceMinor?: number;
    delaySearch?: () => Promise<void>;
  } = {}) {
    super();
    this.options = options;
  }

  override isEnabled(): boolean {
    return this.options.enabled ?? true;
  }

  override getRetentionMode(): ProviderRetentionMode {
    return this.options.retentionMode ?? "RAW_ALLOWED";
  }

  override async getProviderHealth(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: this.isEnabled() ? "healthy" : "disabled",
      checkedAt: NOW.toISOString()
    };
  }

  override async searchRoundTripOffers(input: SearchRoundTripInput): Promise<ProviderOffer[]> {
    this.searchCalls += 1;
    this.activeSearches += 1;
    this.maxConcurrentSearches = Math.max(this.maxConcurrentSearches, this.activeSearches);
    try {
      if (this.options.delaySearch) await this.options.delaySearch();
      if (this.options.failSearch) throw new Error("mock provider failure");
      const offers = await super.searchRoundTripOffers(input);
      return offers.map((offer) => ({
        ...offer,
        price: { amountMinor: this.options.priceMinor ?? 70_000, currency: "MYR" },
        lastVerifiedAt: NOW.toISOString(),
        retentionMode: this.getRetentionMode(),
        display: {
          canAlert: false,
          canDisplay: false,
          requiresRevalidation: true,
          reason: "requires_revalidation"
        },
        revalidationPayload: { mock: true }
      }));
    } finally {
      this.activeSearches -= 1;
    }
  }

  override async revalidateOffer(input: RevalidateOfferInput): Promise<ProviderOffer | null> {
    this.revalidateCalls += 1;
    const offer = await super.revalidateOffer(input);
    if (!offer) return null;
    return {
      ...offer,
      price: { amountMinor: this.options.priceMinor ?? 70_000, currency: "MYR" },
      lastVerifiedAt: this.options.staleRevalidation ? "2026-06-10T06:00:00.000Z" : NOW.toISOString(),
      retentionMode: this.getRetentionMode(),
      display: {
        canAlert: true,
        canDisplay: true,
        requiresRevalidation: false
      }
    };
  }
}

function idFactory(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `id-${String(counter).padStart(3, "0")}`;
  };
}

function route(originIata: string, destinationIata: string, priority = 100): ScanRouteCandidate {
  return {
    originIata,
    destinationIata,
    countryCode: "TH",
    regionGroup: "SOUTHEAST_ASIA",
    priority,
    source: "test"
  };
}

async function run(repository: MemoryScanRepository, options: {
  provider?: RevalidatingMockProvider;
  config?: Partial<SchedulerConfig>;
} = {}) {
  return runScheduledScan({
    repository,
    providers: [options.provider ?? new RevalidatingMockProvider()],
    config: { ...defaultConfig, ...options.config },
    now: NOW,
    idFactory: idFactory()
  });
}

test("cron creates jobs from route candidates", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const result = await run(repository);

  assert.equal(result.jobsCreated, 1);
  assert.equal(repository.jobs.length, 1);
  assert.equal(repository.jobs[0]?.originIata, "KUL");
  assert.equal(repository.jobs[0]?.destinationIata, "BKK");
  assert.equal(repository.jobs[0]?.status, "queued");
  assert.equal(repository.jobs[0]?.cabinClass, "economy");
  assert.equal(repository.jobs[0]?.adults, 1);
});

test("watchlist routes are prioritized first", async () => {
  const repository = new MemoryScanRepository();
  repository.watchlistRoutes = [route("JHB", "TPE", 50)];
  repository.popularSeedRoutes = [route("KUL", "BKK", 1)];

  await run(repository, { config: { maxSearchesPerCronRun: 1 } });

  assert.equal(repository.jobs.length, 1);
  assert.equal(repository.jobs[0]?.originIata, "JHB");
  assert.equal(repository.jobs[0]?.destinationIata, "TPE");
  assert.equal(repository.jobs[0]?.prioritySource, "watchlist");
});

test("previous deal routes are prioritized before exploration", async () => {
  const repository = new MemoryScanRepository();
  repository.previousDealRoutes = [route("KUL", "ICN", 20)];
  repository.explorationRoutes = [route("KUL", "CTU", 1)];

  await run(repository, { config: { maxSearchesPerCronRun: 1 } });

  assert.equal(repository.jobs[0]?.destinationIata, "ICN");
  assert.equal(repository.jobs[0]?.prioritySource, "previous_deal");
});

test("max searches per run is respected", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK"), route("KUL", "SIN"), route("KUL", "TPE")];

  const result = await run(repository, { config: { maxSearchesPerCronRun: 2 } });

  assert.equal(result.jobsCreated, 2);
  assert.equal(repository.jobs.length, 2);
});

test("provider daily budget is respected", async () => {
  const repository = new MemoryScanRepository();
  repository.providerLimits.set("mock", {
    providerName: "mock",
    retentionMode: "RAW_ALLOWED",
    dailyBudget: 1,
    usedToday: 0,
    concurrencyLimit: 3,
    healthStatus: "available",
    failureCount: 0
  });
  repository.popularSeedRoutes = [route("KUL", "BKK"), route("KUL", "SIN")];

  const result = await run(repository, { config: { providerDailyBudget: 50 } });

  assert.equal(result.jobsCreated, 1);
  assert.equal(result.providerBudgetUsed, 1);
  assert.equal(repository.providerLimits.get("mock")?.usedToday, 1);
});

test("disabled provider jobs are skipped safely", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const provider = new RevalidatingMockProvider({ enabled: false });

  const result = await run(repository, { provider });

  assert.equal(result.jobsCreated, 1);
  assert.equal(result.jobsSkipped, 1);
  assert.equal(provider.searchCalls, 0);
  assert.equal(repository.jobUpdates.at(-1)?.update.status, "provider_disabled");
});

test("successful scan persists fare check, fare snapshot, and deal score", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];

  const result = await run(repository);

  assert.equal(result.jobsSucceeded, 1);
  assert.equal(repository.fareChecks.length, 1);
  assert.equal(repository.fareSnapshots.length, 1);
  assert.equal(repository.dealScores.length, 1);
  assert.equal(repository.fareChecks[0]?.amountMinorMyr, 70_000);
  assert.equal(repository.fareSnapshots[0]?.amountMinorMyr, 70_000);
  assert.equal(repository.dealScores[0]?.dealLabel, "strong_deal");
  assert.equal(repository.dealScores[0]?.alertEligible, true);
});

test("scheduler sends Telegram alert after scoring an eligible deal", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const alertSender = new RecordingAlertSender();

  const result = await runScheduledScan({
    repository,
    providers: [new RevalidatingMockProvider()],
    config: defaultConfig,
    now: NOW,
    idFactory: idFactory(),
    alertSender,
    alertCooldownHours: 24
  });

  assert.equal(result.alertsSent, 1);
  assert.equal(alertSender.messages.length, 1);
  assert.equal(repository.alerts.length, 1);
  assert.equal(repository.alerts[0]?.status, "sent");
  assert.equal(repository.alerts[0]?.amountMinorMyr, 70_000);
  assert.equal(repository.alerts[0]?.providerName, "mock");
});

test("scheduler sends Telegram alert for eligible suspected deal", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const alertSender = new RecordingAlertSender();

  const result = await runScheduledScan({
    repository,
    providers: [new RevalidatingMockProvider({ priceMinor: 80_000 })],
    config: defaultConfig,
    now: NOW,
    idFactory: idFactory(),
    alertSender,
    alertCooldownHours: 24
  });

  assert.equal(result.alertsSent, 1);
  assert.equal(repository.dealScores[0]?.dealLabel, "suspected_deal");
  assert.match(alertSender.messages[0] ?? "", /Suspected flight deal found/);
});

test("failed provider call records failed job status and degraded health after repeated failures", async () => {
  const repository = new MemoryScanRepository();
  repository.providerLimits.set("mock", {
    providerName: "mock",
    retentionMode: "RAW_ALLOWED",
    dailyBudget: 5,
    usedToday: 0,
    concurrencyLimit: 1,
    healthStatus: "available",
    failureCount: 0
  });
  repository.popularSeedRoutes = [route("KUL", "BKK"), route("KUL", "SIN")];
  const provider = new RevalidatingMockProvider({ failSearch: true });

  const result = await run(repository, {
    provider,
    config: { providerFailureDegradeThreshold: 2 }
  });

  assert.equal(result.jobsFailed, 2);
  assert.equal(repository.jobUpdates.filter((entry) => entry.update.status === "failed").length, 2);
  assert.equal(repository.providerLimits.get("mock")?.healthStatus, "degraded");
});

test("NO_CACHE mode does not persist raw provider payload", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const provider = new RevalidatingMockProvider({ retentionMode: "NO_CACHE" });

  await run(repository, { provider });

  assert.equal(repository.fareChecks[0]?.retentionMode, "NO_CACHE");
  assert.equal(repository.fareSnapshots[0]?.retentionMode, "NO_CACHE");
  assert.equal(repository.fareChecks[0]?.rawPayloadStored, false);
  assert.equal(repository.fareSnapshots[0]?.rawPayloadStored, false);
});

test("revalidation is attempted before alert/display eligibility", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const provider = new RevalidatingMockProvider();

  await run(repository, { provider });

  assert.equal(provider.revalidateCalls, 1);
  assert.equal(repository.fareChecks[0]?.isRevalidated, true);
  assert.equal(repository.fareChecks[0]?.lastRevalidatedAt, NOW.toISOString());
  assert.equal(repository.dealScores[0]?.alertEligible, true);
});

test("stale revalidation prevents alert/display eligibility", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const provider = new RevalidatingMockProvider({ staleRevalidation: true });

  await run(repository, { provider });

  assert.equal(provider.revalidateCalls, 1);
  assert.equal(repository.fareChecks[0]?.isRevalidated, true);
  assert.equal(repository.fareChecks[0]?.lastRevalidatedAt, "2026-06-10T06:00:00.000Z");
  assert.equal(repository.dealScores[0]?.dealLabel, "urgent_revalidate");
  assert.equal(repository.dealScores[0]?.alertEligible, false);
  assert.equal(repository.alerts.length, 0);
});

test("Telegram send failure does not fail scan and records failed alert", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const alertSender = new RecordingAlertSender({
    status: "failed",
    errorCode: "telegram_http_500",
    errorMessage: "Telegram sendMessage failed with HTTP 500"
  });

  const result = await runScheduledScan({
    repository,
    providers: [new RevalidatingMockProvider()],
    config: defaultConfig,
    now: NOW,
    idFactory: idFactory(),
    alertSender,
    alertCooldownHours: 24
  });

  assert.equal(result.jobsSucceeded, 1);
  assert.equal(result.alertsFailed, 1);
  assert.equal(repository.alerts[0]?.status, "failed");
  assert.equal(repository.alerts[0]?.errorCode, "telegram_http_500");
});

test("scheduler skips duplicate alert within cooldown", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  repository.previousAlerts = [{
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-07-25",
    returnDate: "2026-07-30",
    provider: "mock",
    dealLabel: "strong_deal",
    sentAt: "2026-06-10T07:00:00.000Z"
  }];
  const alertSender = new RecordingAlertSender();

  const result = await runScheduledScan({
    repository,
    providers: [new RevalidatingMockProvider()],
    config: defaultConfig,
    now: NOW,
    idFactory: idFactory(),
    alertSender,
    alertCooldownHours: 24
  });

  assert.equal(result.alertsDuplicate, 1);
  assert.equal(alertSender.messages.length, 0);
  assert.equal(repository.alerts[0]?.status, "duplicate");
});

test("Amadeus missing credentials does not break scheduler through provider registry", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const providers = createProviderRegistry({}, {
    now: () => NOW.getTime(),
    fetch: async () => {
      throw new Error("unexpected network call");
    }
  });

  const result = await runScheduledScan({
    repository,
    providers,
    config: { ...defaultConfig, maxSearchesPerCronRun: 10 },
    now: NOW,
    idFactory: idFactory()
  });

  assert.deepEqual(providers.map((provider) => provider.name), ["mock", "amadeus", "duffel"]);
  assert.equal(result.jobsSucceeded, 1);
  assert.equal(result.jobsSkipped, 2);
  assert.equal(repository.fareChecks.length, 1);
  assert.equal(repository.jobUpdates.some((entry) => entry.update.status === "provider_disabled"), true);
});

test("scheduler works through provider registry with MockProvider as local simulation provider", async () => {
  const repository = new MemoryScanRepository();
  repository.popularSeedRoutes = [route("KUL", "BKK")];
  const providers = createProviderRegistry({});

  const result = await runScheduledScan({
    repository,
    providers,
    config: { ...defaultConfig, maxSearchesPerCronRun: 1 },
    now: NOW,
    idFactory: idFactory()
  });

  assert.equal(result.jobsCreated, 1);
  assert.equal(result.jobsSucceeded, 1);
  assert.equal(repository.fareChecks[0]?.provider, "mock");
});

test("provider concurrency limit is respected", async () => {
  const repository = new MemoryScanRepository();
  repository.providerLimits.set("mock", {
    providerName: "mock",
    retentionMode: "RAW_ALLOWED",
    dailyBudget: 5,
    usedToday: 0,
    concurrencyLimit: 1,
    healthStatus: "available",
    failureCount: 0
  });
  repository.popularSeedRoutes = [route("KUL", "BKK"), route("KUL", "SIN"), route("KUL", "TPE")];
  const provider = new RevalidatingMockProvider({
    delaySearch: () => new Promise((resolve) => setTimeout(resolve, 1))
  });

  await run(repository, {
    provider,
    config: { maxProviderConcurrency: 3 }
  });

  assert.equal(provider.maxConcurrentSearches, 1);
});

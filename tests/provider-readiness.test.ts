import test from "node:test";
import assert from "node:assert/strict";
import { parseRealProviderConfig } from "../src/config/real-providers.ts";
import type { SchedulerConfig } from "../src/config/scheduler.ts";
import { MockProvider } from "../src/providers/mock-provider.ts";
import { createProviderRegistry } from "../src/providers/registry.ts";
import { buildProviderReadinessReports } from "../src/providers/readiness.ts";
import type {
  FlightProvider,
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
import { handleAdminScanRequest } from "../src/routes/admin-scan.ts";
import { handleAppRequest, type AppDependencies } from "../src/routes/app.ts";
import type {
  AirportApiRecord,
  ApiRepository,
  DealApiRecord,
  DealFilters,
  DestinationFilters,
  PriceHistoryApiRecord,
  PriceHistoryFilters,
  ProviderHealthApiRecord,
  ProviderLimitApiRecord
} from "../src/routes/api-types.ts";
import { createScannedDemoApp } from "../src/demo/demo-app.ts";

const NOW = new Date("2026-06-11T08:00:00.000Z");

const schedulerConfig: SchedulerConfig = {
  maxSearchesPerCronRun: 10,
  maxProviderConcurrency: 2,
  providerDailyBudget: 10,
  revalidateBeforeAlertMinutes: 30,
  defaultStayLengthDays: 5,
  departureOffsetDays: 45,
  providerFailureDegradeThreshold: 3
};

class FakeRealProvider implements FlightProvider {
  readonly name = "amadeus";
  searchCalls = 0;
  revalidateCalls = 0;
  private readonly enabled: boolean;
  private readonly retentionMode: ProviderRetentionMode;

  constructor(enabled = true, retentionMode: ProviderRetentionMode = "NO_CACHE") {
    this.enabled = enabled;
    this.retentionMode = retentionMode;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async searchRoundTripOffers(_input: SearchRoundTripInput): Promise<ProviderOffer[]> {
    this.searchCalls += 1;
    throw new Error("real provider search should be blocked");
  }

  async revalidateOffer(_input: RevalidateOfferInput): Promise<ProviderOffer | null> {
    this.revalidateCalls += 1;
    throw new Error("real provider revalidation should be blocked");
  }

  async getProviderHealth(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: this.enabled ? "available" : "disabled",
      checkedAt: NOW.toISOString()
    };
  }

  getRetentionMode(): ProviderRetentionMode {
    return this.retentionMode;
  }
}

class MemoryScanRepository implements ScanRepository {
  jobs: PlannedSearchJob[] = [];
  jobUpdates: Array<{ jobId: string; update: SearchJobUpdate }> = [];
  providerLimits = new Map<string, ProviderLimitState>();

  async listWatchlistRoutes(): Promise<ScanRouteCandidate[]> {
    return [];
  }

  async listPreviousDealRoutes(): Promise<ScanRouteCandidate[]> {
    return [];
  }

  async listPopularSeedRoutes(): Promise<ScanRouteCandidate[]> {
    return [{
      originIata: "KUL",
      destinationIata: "BKK",
      countryCode: "TH",
      regionGroup: "SOUTHEAST_ASIA",
      priority: 1,
      source: "seed",
      departureDate: "2026-07-25",
      returnDate: "2026-07-30",
      stayLengthDays: 5
    }];
  }

  async listExplorationRoutes(): Promise<ScanRouteCandidate[]> {
    return [];
  }

  async getHistoricalSamples(): Promise<HistoricalFareSample[]> {
    return [];
  }

  async getProviderLimit(providerName: string): Promise<ProviderLimitState | null> {
    return this.providerLimits.get(providerName) ?? {
      providerName,
      retentionMode: "NO_CACHE",
      dailyBudget: 10,
      usedToday: 0,
      concurrencyLimit: 1,
      healthStatus: "available",
      failureCount: 0
    };
  }

  async createSearchJob(job: PlannedSearchJob): Promise<void> {
    this.jobs.push(job);
  }

  async updateSearchJob(jobId: string, update: SearchJobUpdate): Promise<void> {
    this.jobUpdates.push({ jobId, update });
  }

  async incrementProviderUsage(): Promise<void> {}
  async recordProviderFailure(): Promise<void> {}
  async recordProviderSuccess(): Promise<void> {}
  async insertFareCheck(_record: PersistedFareCheck): Promise<void> {}
  async insertFareSnapshot(_record: PersistedFareSnapshot): Promise<void> {}
  async insertDealScore(_record: PersistedDealScore): Promise<void> {}
  async listRecentAlertsForDedupe(): Promise<[]> { return []; }
  async insertAlert(): Promise<void> {}
  async markRouteScanned(): Promise<void> {}
}

class MinimalApiRepository implements ApiRepository {
  async listOrigins(): Promise<AirportApiRecord[]> {
    return [];
  }

  async listDestinations(_filters: DestinationFilters): Promise<AirportApiRecord[]> {
    return [];
  }

  async listDeals(_filters: DealFilters): Promise<DealApiRecord[]> {
    return [];
  }

  async listPriceHistory(_filters: PriceHistoryFilters): Promise<PriceHistoryApiRecord[]> {
    return [];
  }

  async listProviderLimits(): Promise<ProviderLimitApiRecord[]> {
    return [{
      provider_name: "amadeus",
      retention_mode: "NO_CACHE",
      daily_budget: 10,
      used_today: 0,
      remaining_budget: 10,
      health_status: "available",
      last_success_at: null,
      last_failure_at: null,
      failure_count: 0
    }];
  }
}

function idFactory(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `readiness-${counter}`;
  };
}

test("real provider config disables live providers and enables dry-run by default", () => {
  const config = parseRealProviderConfig({});

  assert.equal(config.enableRealProviders, false);
  assert.equal(config.realProviderDryRun, true);
  assert.equal(config.defaultRealProvider, null);
});

test("readiness blocks live search when real providers are disabled or dry-run is enabled", () => {
  const provider = new FakeRealProvider(true);
  const config = parseRealProviderConfig({
    AMADEUS_CLIENT_ID: "id",
    AMADEUS_CLIENT_SECRET: "secret",
    DEFAULT_REAL_PROVIDER: "amadeus"
  });
  const report = buildProviderReadinessReports({
    providers: [provider],
    env: {
      AMADEUS_CLIENT_ID: "id",
      AMADEUS_CLIENT_SECRET: "secret"
    },
    config
  })[0];

  assert.ok(report);
  assert.equal(report.credentials_configured, true);
  assert.equal(report.can_search_live, false);
  assert.equal(report.can_revalidate_live, false);
  assert.equal(report.blocking_reasons.includes("real_providers_disabled"), true);
  assert.equal(report.blocking_reasons.includes("dry_run_enabled"), true);
});

test("missing credentials and exhausted budget block provider readiness", () => {
  const provider = new FakeRealProvider(true);
  const config = parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "false",
    DEFAULT_REAL_PROVIDER: "amadeus"
  });
  const report = buildProviderReadinessReports({
    providers: [provider],
    env: {},
    config,
    providerLimits: [{ providerName: "amadeus", dailyBudget: 2, usedToday: 2 }]
  })[0];

  assert.ok(report);
  assert.equal(report.credentials_configured, false);
  assert.equal(report.remaining_budget, 0);
  assert.equal(report.blocking_reasons.includes("credentials_missing"), true);
  assert.equal(report.blocking_reasons.includes("budget_exhausted"), true);
});

test("provider health exposes readiness booleans and never exposes secrets", async () => {
  const secret = "super-secret-amadeus-token";
  const provider = new FakeRealProvider(true);
  const config = parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "true",
    DEFAULT_REAL_PROVIDER: "amadeus",
    AMADEUS_CLIENT_ID: "id",
    AMADEUS_CLIENT_SECRET: secret
  });
  const dependencies: AppDependencies = {
    apiRepository: new MinimalApiRepository(),
    providers: [provider],
    schedulerConfig,
    realProviderConfig: config,
    providerReadinessEnv: {
      AMADEUS_CLIENT_ID: "id",
      AMADEUS_CLIENT_SECRET: secret
    },
    now: () => NOW
  };

  const response = await handleAppRequest(new Request("https://radar.test/api/provider-health"), {}, dependencies);
  const body = await response.json() as { providers: ProviderHealthApiRecord[] };
  const serialized = JSON.stringify(body);
  const readiness = body.providers[0]?.readiness;

  assert.equal(response.status, 200);
  assert.ok(readiness);
  assert.equal(readiness.credentials_configured, true);
  assert.equal(readiness.can_search_live, false);
  assert.equal(readiness.blocking_reasons.includes("dry_run_enabled"), true);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("AMADEUS_CLIENT_SECRET"), false);
});

test("scheduler does not call a real provider when dry-run readiness blocks it", async () => {
  const provider = new FakeRealProvider(true);
  const repository = new MemoryScanRepository();
  const realProviderConfig = parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "true",
    DEFAULT_REAL_PROVIDER: "amadeus",
    AMADEUS_CLIENT_ID: "id",
    AMADEUS_CLIENT_SECRET: "secret"
  });
  const providerReadiness = buildProviderReadinessReports({
    providers: [provider],
    env: {
      AMADEUS_CLIENT_ID: "id",
      AMADEUS_CLIENT_SECRET: "secret"
    },
    config: realProviderConfig
  });

  const result = await runScheduledScan({
    repository,
    providers: [provider],
    config: schedulerConfig,
    realProviderConfig,
    providerReadiness,
    now: NOW,
    idFactory: idFactory()
  });

  assert.equal(result.jobsCreated, 1);
  assert.equal(result.jobsSkipped, 1);
  assert.equal(provider.searchCalls, 0);
  assert.equal(repository.jobUpdates.at(-1)?.update.status, "dry_run_blocked");
});

test("admin scan uses readiness guard and does not call real provider during dry-run", async () => {
  const provider = new FakeRealProvider(true);
  const repository = new MemoryScanRepository();
  const realProviderConfig = parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "true",
    DEFAULT_REAL_PROVIDER: "amadeus",
    AMADEUS_CLIENT_ID: "id",
    AMADEUS_CLIENT_SECRET: "secret"
  });
  const providerReadiness = buildProviderReadinessReports({
    providers: [provider],
    env: {
      AMADEUS_CLIENT_ID: "id",
      AMADEUS_CLIENT_SECRET: "secret"
    },
    config: realProviderConfig
  });

  const response = await handleAdminScanRequest(
    new Request("https://radar.test/api/admin/scan", {
      method: "POST",
      headers: { Authorization: "Bearer admin-token" }
    }),
    { ADMIN_TOKEN: "admin-token" },
    {
      repository,
      providers: [provider],
      config: schedulerConfig,
      realProviderConfig,
      providerReadiness
    }
  );
  const body = await response.json() as { result: { jobsSkipped: number } };

  assert.equal(response.status, 200);
  assert.equal(body.result.jobsSkipped, 1);
  assert.equal(provider.searchCalls, 0);
  assert.equal(repository.jobUpdates.at(-1)?.update.status, "dry_run_blocked");
});

test("MockProvider remains ready for local demo while Amadeus missing credentials is disabled", async () => {
  const app = await createScannedDemoApp();
  const response = await app.handle(new Request("https://demo.test/api/provider-health"));
  const body = await response.json() as { providers: ProviderHealthApiRecord[] };
  const mock = body.providers.find((provider) => provider.provider_name === "mock");
  const amadeus = body.providers.find((provider) => provider.provider_name === "amadeus");

  assert.ok(mock?.readiness);
  assert.equal(mock.readiness.demo_ready, true);
  assert.equal(mock.readiness.can_search_live, false);
  assert.ok(amadeus?.readiness);
  assert.equal(amadeus.enabled, false);
  assert.equal(amadeus.readiness.credentials_configured, false);
  assert.equal(amadeus.readiness.blocking_reasons.includes("credentials_missing"), true);
});

test("provider registry with missing Amadeus credentials remains safe and makes no network calls", async () => {
  const providers = createProviderRegistry({}, {
    fetch: async () => {
      throw new Error("unexpected network call");
    },
    now: () => NOW.getTime(),
    sleep: async () => {}
  });
  const amadeus = providers.find((provider) => provider.name === "amadeus");
  const health = await amadeus?.getProviderHealth();

  assert.ok(amadeus);
  assert.equal(amadeus.isEnabled(), false);
  assert.equal(health?.status, "disabled");
});

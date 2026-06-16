import test from "node:test";
import assert from "node:assert/strict";
import { parseDuffelConfig } from "../src/config/duffel.ts";
import { parseRealProviderConfig } from "../src/config/real-providers.ts";
import { buildProviderReadinessReports } from "../src/providers/readiness.ts";
import { DuffelProvider, buildDuffelOfferRequest, normalizeDuffelOffer } from "../src/providers/duffel/index.ts";
import type {
  FlightProvider,
  ProviderHealth,
  ProviderOffer,
  ProviderRetentionMode,
  RevalidateOfferInput,
  SearchRoundTripInput
} from "../src/providers/types.ts";
import { handleAppRequest, type AppDependencies } from "../src/routes/app.ts";
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
  ProviderHealthApiRecord,
  ProviderLimitApiRecord
} from "../src/routes/api-types.ts";
import type { SchedulerConfig } from "../src/config/scheduler.ts";
import { runScheduledScan } from "../src/scanner/scheduled-scan.ts";
import type { PersistedAlertRecord } from "../src/alerts/types.ts";
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

const NOW = new Date("2026-06-11T08:00:00.000Z");
const TEST_TOKEN = "duffel_test_secret_token";

interface MockCall {
  url: string;
  init: RequestInit | undefined;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

function enabledRealConfig() {
  return parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "false",
    DEFAULT_REAL_PROVIDER: "duffel"
  });
}

function makeProvider(
  fetchImpl: typeof fetch,
  env: Record<string, string | undefined> = {},
  realEnv: Record<string, string | undefined> = {
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "false",
    DEFAULT_REAL_PROVIDER: "duffel"
  },
  sleep: (ms: number) => Promise<void> = async () => {}
): DuffelProvider {
  return new DuffelProvider(
    parseDuffelConfig({
      DUFFEL_ACCESS_TOKEN: TEST_TOKEN,
      DUFFEL_API_BASE_URL: "https://api.duffel.test",
      DUFFEL_TIMEOUT_MS: "1000",
      DUFFEL_RETRY_LIMIT: "1",
      ...env
    }),
    parseRealProviderConfig(realEnv),
    {
      fetch: fetchImpl,
      now: () => NOW.getTime(),
      sleep
    }
  );
}

function duffelOffer(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "off_123",
    total_amount: "499.90",
    total_currency: "MYR",
    expires_at: "2026-06-11T08:30:00.000Z",
    live_mode: false,
    slices: [
      {
        origin: { iata_code: "KUL" },
        destination: { iata_code: "BKK" },
        departure_date: "2026-10-01",
        duration: "PT2H10M",
        segments: [
          {
            origin: { iata_code: "KUL" },
            destination: { iata_code: "BKK" },
            departing_at: "2026-10-01T08:00:00",
            arriving_at: "2026-10-01T10:10:00",
            duration: "PT2H10M",
            marketing_carrier: { iata_code: "MH" },
            operating_carrier: { iata_code: "MH" },
            marketing_carrier_flight_number: "780",
            passengers: [{ cabin_class: "economy" }],
            stops: []
          }
        ]
      },
      {
        origin: { iata_code: "BKK" },
        destination: { iata_code: "KUL" },
        departure_date: "2026-10-06",
        duration: "PT2H15M",
        segments: [
          {
            origin: { iata_code: "BKK" },
            destination: { iata_code: "KUL" },
            departing_at: "2026-10-06T18:00:00",
            arriving_at: "2026-10-06T21:15:00",
            duration: "PT2H15M",
            marketing_carrier: { iata_code: "MH" },
            operating_carrier: { iata_code: "MH" },
            marketing_carrier_flight_number: "781",
            passengers: [{ cabin_class: "economy" }],
            stops: []
          }
        ]
      }
    ],
    ...overrides
  };
}

function searchInput(): SearchRoundTripInput {
  return {
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  };
}

const schedulerConfig: SchedulerConfig = {
  maxSearchesPerCronRun: 10,
  maxProviderConcurrency: 1,
  providerDailyBudget: 10,
  revalidateBeforeAlertMinutes: 30,
  defaultStayLengthDays: 5,
  departureOffsetDays: 45,
  providerFailureDegradeThreshold: 2
};

class MinimalScanRepository implements ScanRepository {
  jobs: PlannedSearchJob[] = [];
  jobUpdates: Array<{ jobId: string; update: SearchJobUpdate }> = [];

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
      source: "seed"
    }];
  }

  async listExplorationRoutes(): Promise<ScanRouteCandidate[]> {
    return [];
  }

  async getHistoricalSamples(): Promise<HistoricalFareSample[]> {
    return [];
  }

  async getProviderLimit(providerName: string): Promise<ProviderLimitState | null> {
    return {
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
  async insertAlert(_record: PersistedAlertRecord): Promise<void> {}
  async markRouteScanned(): Promise<void> {}
}

class MinimalApiRepository implements ApiRepository {
  async listOrigins(): Promise<AirportApiRecord[]> { return []; }
  async listDestinations(_filters: DestinationFilters): Promise<AirportApiRecord[]> { return []; }
  async listDeals(_filters: DealFilters): Promise<DealApiRecord[]> { return []; }
  async listPriceHistory(_filters: PriceHistoryFilters): Promise<PriceHistoryApiRecord[]> { return []; }
  async listPriceCalendar(_filters: PriceCalendarFilters): Promise<PriceCalendarApiRecord[]> { return []; }
  async listProviderLimits(): Promise<ProviderLimitApiRecord[]> {
    return [{
      provider_name: "duffel",
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

test("Duffel missing token blocks provider and avoids network calls", async () => {
  let calls = 0;
  const provider = new DuffelProvider(
    parseDuffelConfig({ DUFFEL_API_BASE_URL: "https://api.duffel.test" }),
    enabledRealConfig(),
    {
      fetch: async () => {
        calls += 1;
        throw new Error("network should not be called");
      },
      now: () => NOW.getTime()
    }
  );

  assert.equal(provider.isEnabled(), false);
  assert.deepEqual(await provider.searchRoundTripOffers(searchInput()), []);
  assert.equal((await provider.getProviderHealth()).status, "disabled");
  assert.equal(calls, 0);
});

test("Duffel test token is detected safely in config and readiness", () => {
  const config = parseDuffelConfig({ DUFFEL_ACCESS_TOKEN: TEST_TOKEN });
  const provider = new DuffelProvider(config, enabledRealConfig(), { now: () => NOW.getTime() });
  const report = buildProviderReadinessReports({
    providers: [provider],
    env: {
      ENABLE_REAL_PROVIDERS: "true",
      REAL_PROVIDER_DRY_RUN: "false",
      DEFAULT_REAL_PROVIDER: "duffel",
      DUFFEL_ACCESS_TOKEN: TEST_TOKEN
    },
    config: enabledRealConfig()
  })[0];

  assert.equal(config.testModeDetected, true);
  assert.equal(report?.provider_name, "duffel");
  assert.equal(report?.test_mode, true);
  assert.equal(report?.credentials_configured, true);
});

test("real providers disabled blocks Duffel readiness", () => {
  const provider = new DuffelProvider(parseDuffelConfig({ DUFFEL_ACCESS_TOKEN: TEST_TOKEN }));
  const config = parseRealProviderConfig({
    DUFFEL_ACCESS_TOKEN: TEST_TOKEN,
    DEFAULT_REAL_PROVIDER: "duffel"
  });
  const report = buildProviderReadinessReports({
    providers: [provider],
    env: { DUFFEL_ACCESS_TOKEN: TEST_TOKEN },
    config
  })[0];

  assert.equal(provider.isEnabled(), false);
  assert.equal(report?.can_search_live, false);
  assert.equal(report?.blocking_reasons.includes("real_providers_disabled"), true);
});

test("dry-run blocks Duffel readiness", () => {
  const realConfig = parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "true",
    DEFAULT_REAL_PROVIDER: "duffel"
  });
  const provider = new DuffelProvider(parseDuffelConfig({ DUFFEL_ACCESS_TOKEN: TEST_TOKEN }), realConfig);
  const report = buildProviderReadinessReports({
    providers: [provider],
    env: { DUFFEL_ACCESS_TOKEN: TEST_TOKEN },
    config: realConfig
  })[0];

  assert.equal(provider.isEnabled(), false);
  assert.equal(report?.blocking_reasons.includes("dry_run_enabled"), true);
});

test("provider_not_selected blocks Duffel if DEFAULT_REAL_PROVIDER is not duffel", () => {
  const realConfig = parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "false",
    DEFAULT_REAL_PROVIDER: "amadeus"
  });
  const provider = new DuffelProvider(parseDuffelConfig({ DUFFEL_ACCESS_TOKEN: TEST_TOKEN }), realConfig);
  const report = buildProviderReadinessReports({
    providers: [provider],
    env: { DUFFEL_ACCESS_TOKEN: TEST_TOKEN },
    config: realConfig
  })[0];

  assert.equal(provider.isEnabled(), false);
  assert.equal(report?.blocking_reasons.includes("provider_not_selected"), true);
});

test("unsupported Duffel currency blocks readiness and provider enablement", () => {
  const provider = new DuffelProvider(
    parseDuffelConfig({
      DUFFEL_ACCESS_TOKEN: TEST_TOKEN,
      DUFFEL_CURRENCY_CODE: "USD"
    }),
    enabledRealConfig()
  );
  const report = buildProviderReadinessReports({
    providers: [provider],
    env: {
      DUFFEL_ACCESS_TOKEN: TEST_TOKEN,
      DUFFEL_CURRENCY_CODE: "USD"
    },
    config: enabledRealConfig()
  })[0];

  assert.equal(provider.isEnabled(), false);
  assert.equal(report?.blocking_reasons.includes("unsupported_currency"), true);
});

test("Duffel request builder creates round-trip economy request with one adult by default", () => {
  const request = buildDuffelOfferRequest(parseDuffelConfig({ DUFFEL_ACCESS_TOKEN: TEST_TOKEN }), searchInput());

  assert.equal(request.url, "https://api.duffel.com/air/offer_requests?return_offers=true");
  assert.equal(request.body.data.slices.length, 2);
  assert.deepEqual(request.body.data.slices[0], {
    origin: "KUL",
    destination: "BKK",
    departure_date: "2026-10-01"
  });
  assert.deepEqual(request.body.data.slices[1], {
    origin: "BKK",
    destination: "KUL",
    departure_date: "2026-10-06"
  });
  assert.equal(request.body.data.cabin_class, "economy");
  assert.deepEqual(request.body.data.passengers, [{ type: "adult" }]);
  assert.equal(request.body.data.currency, "MYR");
});

test("valid Duffel search response normalizes into ProviderOffer and revalidation enables display", async () => {
  const calls: MockCall[] = [];
  const provider = makeProvider(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/air/offers/off_123")) {
      return jsonResponse({ data: duffelOffer({ public_url: "https://duffel.test/offers/off_123" }) });
    }
    return jsonResponse({ data: { offers: [duffelOffer()] } });
  });

  const [offer] = await provider.searchRoundTripOffers(searchInput());
  assert.ok(offer);
  assert.equal(offer.provider, "duffel");
  assert.equal(offer.providerOfferId, "off_123");
  assert.equal(offer.price.amountMinor, 49_990);
  assert.equal(offer.price.currency, "MYR");
  assert.deepEqual(offer.carriers, ["MH"]);
  assert.equal(offer.totalStops, 0);
  assert.equal(offer.durationMinutes, 265);
  assert.equal(offer.display.canDisplay, false);
  assert.equal(offer.display.requiresRevalidation, true);
  assert.equal(offer.retentionMode, "NO_CACHE");
  assert.deepEqual(Object.keys(offer.revalidationPayload as Record<string, unknown>).sort(), [
    "expiresAt",
    "liveMode",
    "originalAmount",
    "originalCurrency",
    "providerOfferId"
  ]);

  const revalidated = await provider.revalidateOffer({
    providerOfferId: offer.providerOfferId,
    originIata: offer.originIata,
    destinationIata: offer.destinationIata,
    departureDate: offer.departureDate,
    returnDate: offer.returnDate,
    revalidationPayload: offer.revalidationPayload
  });

  assert.ok(revalidated);
  assert.equal(revalidated.display.canDisplay, true);
  assert.equal(revalidated.display.canAlert, true);
  assert.equal(revalidated.display.requiresRevalidation, false);
  assert.equal(revalidated.deepLink, "https://duffel.test/offers/off_123");
  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[0]?.init?.headers).get("Duffel-Version"), "v2");
});

test("malformed Duffel response is rejected", async () => {
  const provider = makeProvider(async () => jsonResponse({ data: { offers: "bad" } }));

  await assert.rejects(provider.searchRoundTripOffers(searchInput()), /Invalid Duffel Offer Request response/);
});

test("non-MYR Duffel response is rejected unless conversion exists", async () => {
  const provider = makeProvider(async () => jsonResponse({
    data: {
      offers: [duffelOffer({ total_currency: "USD", total_amount: "99.00" })]
    }
  }));

  assert.deepEqual(await provider.searchRoundTripOffers(searchInput()), []);
});

test("expired Duffel offer is rejected", () => {
  const config = parseDuffelConfig({ DUFFEL_ACCESS_TOKEN: TEST_TOKEN });
  const offer = normalizeDuffelOffer(
    duffelOffer({ expires_at: "2026-06-11T07:59:59.000Z" }) as never,
    searchInput(),
    config,
    NOW.toISOString(),
    false,
    NOW.getTime()
  );

  assert.equal(offer, null);
});

test("Duffel retries 429 with Retry-After backoff", async () => {
  const slept: number[] = [];
  let calls = 0;
  const provider = makeProvider(async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ errors: [] }, 429, { "Retry-After": "1" });
    return jsonResponse({ data: { offers: [duffelOffer()] } });
  }, {}, undefined, async (ms) => {
    slept.push(ms);
  });

  const offers = await provider.searchRoundTripOffers(searchInput());

  assert.equal(offers.length, 1);
  assert.equal(calls, 2);
  assert.deepEqual(slept, [1_000]);
});

test("Duffel retries 5xx transient failures", async () => {
  let calls = 0;
  const provider = makeProvider(async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ errors: [] }, 503);
    return jsonResponse({ data: { offers: [duffelOffer()] } });
  });

  const offers = await provider.searchRoundTripOffers(searchInput());

  assert.equal(offers.length, 1);
  assert.equal(calls, 2);
});

test("Duffel errors are sanitized and do not expose the access token", async () => {
  const provider = makeProvider(async () => jsonResponse({ errors: [] }, 401));

  await assert.rejects(
    provider.searchRoundTripOffers(searchInput()),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(message.includes(TEST_TOKEN), false);
      return true;
    }
  );
});

test("scheduler does not call Duffel when readiness blocks it", async () => {
  class CountingDuffelProvider extends DuffelProvider {
    searchCalls = 0;

    override async searchRoundTripOffers(input: SearchRoundTripInput): Promise<ProviderOffer[]> {
      this.searchCalls += 1;
      return super.searchRoundTripOffers(input);
    }
  }

  const realConfig = parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "true",
    DEFAULT_REAL_PROVIDER: "duffel"
  });
  const provider = new CountingDuffelProvider(
    parseDuffelConfig({ DUFFEL_ACCESS_TOKEN: TEST_TOKEN }),
    realConfig,
    {
      fetch: async () => {
        throw new Error("network should not be called");
      },
      now: () => NOW.getTime()
    }
  );
  const readiness = buildProviderReadinessReports({
    providers: [provider],
    env: { DUFFEL_ACCESS_TOKEN: TEST_TOKEN },
    config: realConfig
  });
  const repository = new MinimalScanRepository();

  const result = await runScheduledScan({
    repository,
    providers: [provider],
    config: schedulerConfig,
    realProviderConfig: realConfig,
    providerReadiness: readiness,
    now: NOW,
    idFactory: (() => {
      let counter = 0;
      return () => `duffel-job-${counter += 1}`;
    })()
  });

  assert.equal(result.jobsCreated, 1);
  assert.equal(result.jobsSkipped, 1);
  assert.equal(provider.searchCalls, 0);
  assert.equal(repository.jobUpdates.at(-1)?.update.status, "dry_run_blocked");
});

test("/api/provider-health shows Duffel readiness without exposing token", async () => {
  const realConfig = parseRealProviderConfig({
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "true",
    DEFAULT_REAL_PROVIDER: "duffel"
  });
  const provider = new DuffelProvider(
    parseDuffelConfig({ DUFFEL_ACCESS_TOKEN: TEST_TOKEN }),
    realConfig,
    { now: () => NOW.getTime() }
  );
  const dependencies: AppDependencies = {
    apiRepository: new MinimalApiRepository(),
    providers: [provider],
    schedulerConfig,
    realProviderConfig: realConfig,
    providerReadinessEnv: { DUFFEL_ACCESS_TOKEN: TEST_TOKEN },
    now: () => NOW
  };

  const response = await handleAppRequest(new Request("https://radar.test/api/provider-health"), {}, dependencies);
  const body = await response.json() as { providers: ProviderHealthApiRecord[] };
  const serialized = JSON.stringify(body);
  const duffel = body.providers.find((providerHealth) => providerHealth.provider_name === "duffel");

  assert.equal(response.status, 200);
  assert.ok(duffel?.readiness);
  assert.equal(duffel.readiness.test_mode, true);
  assert.equal(duffel.readiness.credentials_configured, true);
  assert.equal(duffel.readiness.enabled, false);
  assert.equal(duffel.readiness.blocking_reasons.includes("dry_run_enabled"), true);
  assert.equal(serialized.includes(TEST_TOKEN), false);
});

test("mocked Duffel tests use injected HTTP only", async () => {
  const calls: MockCall[] = [];
  const provider = makeProvider(async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ data: { offers: [duffelOffer()] } });
  });

  await provider.searchRoundTripOffers(searchInput());

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.startsWith("https://api.duffel.test/air/offer_requests"), true);
});

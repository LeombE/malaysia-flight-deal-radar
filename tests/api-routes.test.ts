import test from "node:test";
import assert from "node:assert/strict";
import type { SchedulerConfig } from "../src/config/scheduler.ts";
import { createProviderRegistry } from "../src/providers/registry.ts";
import type { FlightProvider } from "../src/providers/types.ts";
import { handleAppRequest, type AppDependencies, type FlightRadarEnv } from "../src/routes/app.ts";
import type {
  AirportApiRecord,
  ApiRepository,
  DealApiRecord,
  DealFilters,
  DestinationFilters,
  PriceHistoryApiRecord,
  PriceHistoryFilters,
  ProviderLimitApiRecord
} from "../src/routes/api-types.ts";
import type { ScanRunResult } from "../src/scanner/types.ts";

const NOW = new Date("2026-06-10T08:00:00.000Z");

const schedulerConfig: SchedulerConfig = {
  maxSearchesPerCronRun: 10,
  maxProviderConcurrency: 2,
  providerDailyBudget: 10,
  revalidateBeforeAlertMinutes: 30,
  defaultStayLengthDays: 5,
  departureOffsetDays: 45,
  providerFailureDegradeThreshold: 3
};

const origins: AirportApiRecord[] = [
  {
    iata_code: "JHB",
    airport_name: "Senai International Airport",
    city: "Johor Bahru",
    country_code: "MY",
    region_group: "MALAYSIA",
    active: true
  },
  {
    iata_code: "KUL",
    airport_name: "Kuala Lumpur International Airport",
    city: "Kuala Lumpur",
    country_code: "MY",
    region_group: "MALAYSIA",
    active: true
  },
  {
    iata_code: "SZB",
    airport_name: "Sultan Abdul Aziz Shah Airport",
    city: "Subang",
    country_code: "MY",
    region_group: "MALAYSIA",
    active: true
  }
];

const destinations: AirportApiRecord[] = [
  {
    iata_code: "BKK",
    airport_name: "Suvarnabhumi Airport",
    city: "Bangkok",
    country_code: "TH",
    region_group: "SOUTHEAST_ASIA",
    active: true
  },
  {
    iata_code: "TPE",
    airport_name: "Taiwan Taoyuan International Airport",
    city: "Taipei",
    country_code: "TW",
    region_group: "EAST_ASIA",
    active: true
  },
  {
    iata_code: "NRT",
    airport_name: "Narita International Airport",
    city: "Tokyo",
    country_code: "JP",
    region_group: "EAST_ASIA",
    active: true
  }
];

function deal(overrides: Partial<DealApiRecord> = {}): DealApiRecord {
  return {
    origin: "KUL",
    destination: "BKK",
    departure_date: "2026-07-25",
    return_date: "2026-07-30",
    stay_length_days: 5,
    amount_minor_myr: 69_900,
    display_price_rm: "RM699.00",
    baseline_median_minor_myr: 99_900,
    historical_p10_minor_myr: 70_000,
    discount_pct: 30.03,
    deal_score: 88,
    deal_label: "strong_deal",
    carrier: "MH",
    stops: 0,
    total_duration_minutes: 360,
    provider_name: "mock",
    last_revalidated_at: NOW.toISOString(),
    expires_at: "2026-06-11T08:00:00.000Z",
    alert_status: null,
    warning: null,
    is_live: true,
    ...overrides
  };
}

const liveDeal = deal();
const staleDeal = deal({
  destination: "TPE",
  departure_date: "2026-08-01",
  return_date: "2026-08-08",
  stay_length_days: 7,
  amount_minor_myr: 88_000,
  display_price_rm: "RM880.00",
  discount_pct: 25,
  deal_score: 76,
  deal_label: "suspected_deal",
  last_revalidated_at: "2026-06-10T06:00:00.000Z",
  warning: "Stale fare. Revalidate before alert or purchase.",
  is_live: false
});
const expiredDeal = deal({
  destination: "NRT",
  departure_date: "2026-09-01",
  return_date: "2026-09-06",
  amount_minor_myr: 130_000,
  display_price_rm: "RM1300.00",
  deal_score: 81,
  expires_at: "2026-06-10T07:59:59.000Z",
  warning: "Expired offer. Do not treat as live fare.",
  is_live: false
});

const priceHistory: PriceHistoryApiRecord[] = [
  {
    origin: "KUL",
    destination: "BKK",
    departure_date: "2026-07-25",
    return_date: "2026-07-30",
    provider: "mock",
    amount_minor_myr: 69_900,
    retrieved_at: "2026-06-10T08:00:00.000Z",
    revalidated_at: NOW.toISOString()
  },
  {
    origin: "KUL",
    destination: "TPE",
    departure_date: "2026-08-01",
    return_date: "2026-08-08",
    provider: "mock",
    amount_minor_myr: 88_000,
    retrieved_at: "2026-06-10T07:00:00.000Z",
    revalidated_at: "2026-06-10T06:00:00.000Z"
  }
];

class MemoryApiRepository implements ApiRepository {
  lastDestinationFilters: DestinationFilters | null = null;
  lastDealFilters: DealFilters | null = null;
  lastPriceHistoryFilters: PriceHistoryFilters | null = null;
  providerLimits: ProviderLimitApiRecord[] = [
    {
      provider_name: "mock",
      retention_mode: "RAW_ALLOWED",
      daily_budget: 10,
      used_today: 2,
      remaining_budget: 8,
      health_status: "healthy",
      last_success_at: NOW.toISOString(),
      last_failure_at: null,
      failure_count: 0
    }
  ];

  async listOrigins(): Promise<AirportApiRecord[]> {
    return origins;
  }

  async listDestinations(filters: DestinationFilters): Promise<AirportApiRecord[]> {
    this.lastDestinationFilters = filters;
    return destinations.filter((destination) => {
      if (filters.country_code && destination.country_code !== filters.country_code) return false;
      if (filters.region_group && destination.region_group !== filters.region_group) return false;
      return true;
    });
  }

  async listDeals(filters: DealFilters): Promise<DealApiRecord[]> {
    this.lastDealFilters = filters;
    return [staleDeal, liveDeal, expiredDeal]
      .filter((item) => {
        const destination = destinations.find((candidate) => candidate.iata_code === item.destination);
        if (filters.origin_iata && item.origin !== filters.origin_iata) return false;
        if (filters.destination_iata && item.destination !== filters.destination_iata) return false;
        if (filters.country_code && destination?.country_code !== filters.country_code) return false;
        if (filters.region_group && destination?.region_group !== filters.region_group) return false;
        if (filters.min_score !== undefined && item.deal_score < filters.min_score) return false;
        if (filters.stay_length_days !== undefined && item.stay_length_days !== filters.stay_length_days) return false;
        if (filters.departure_from && item.departure_date < filters.departure_from) return false;
        if (filters.departure_to && item.departure_date > filters.departure_to) return false;
        if (filters.only_recently_verified && !item.is_live) return false;
        return true;
      })
      .sort((left, right) => right.deal_score - left.deal_score);
  }

  async listPriceHistory(filters: PriceHistoryFilters): Promise<PriceHistoryApiRecord[]> {
    this.lastPriceHistoryFilters = filters;
    return priceHistory.filter((item) => {
      if (filters.origin_iata && item.origin !== filters.origin_iata) return false;
      if (filters.destination_iata && item.destination !== filters.destination_iata) return false;
      if (filters.provider_name && item.provider !== filters.provider_name) return false;
      return true;
    });
  }

  async listProviderLimits(): Promise<ProviderLimitApiRecord[]> {
    return this.providerLimits;
  }
}

function scanResult(): ScanRunResult {
  return {
    runId: "scan-1",
    jobsCreated: 1,
    jobsSucceeded: 1,
    jobsFailed: 0,
    jobsSkipped: 0,
    offersSeen: 1,
    fareChecksInserted: 1,
    fareSnapshotsInserted: 1,
    dealScoresInserted: 1,
    alertsSent: 0,
    alertsSkipped: 1,
    alertsDisabled: 0,
    alertsFailed: 0,
    alertsDuplicate: 0,
    revalidationsAttempted: 1,
    providerBudgetUsed: 1
  };
}

function app(options: {
  env?: FlightRadarEnv;
  repository?: MemoryApiRepository;
  providers?: FlightProvider[];
  runScan?: () => Promise<ScanRunResult>;
} = {}) {
  const repository = options.repository ?? new MemoryApiRepository();
  const dependencies: AppDependencies = {
    apiRepository: repository,
    providers: options.providers ?? createProviderRegistry({}, {
      fetch: async () => {
        throw new Error("unexpected network call");
      },
      now: () => NOW.getTime()
    }),
    schedulerConfig,
    now: () => NOW
  };
  if (options.runScan) dependencies.runScan = options.runScan;
  return {
    repository,
    request: (path: string, init?: RequestInit) => handleAppRequest(
      new Request(`https://radar.test${path}`, init),
      options.env ?? {},
      dependencies
    )
  };
}

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test("GET /health returns sanitized provider status", async () => {
  const { request } = app();
  const response = await request("/health");
  const body = await json<{ ok: boolean; status: string; providers: Array<{ provider_name: string; status: string; enabled: boolean }> }>(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "ok");
  assert.equal(body.providers.some((provider) => provider.provider_name === "mock" && provider.status === "healthy"), true);
  assert.equal(JSON.stringify(body).includes("AMADEUS_CLIENT_SECRET"), false);
});

test("GET /api/origins returns Malaysia origin airports", async () => {
  const { request } = app();
  const response = await request("/api/origins");
  const body = await json<{ origins: AirportApiRecord[] }>(response);

  assert.deepEqual(body.origins.map((origin) => origin.iata_code), ["JHB", "KUL", "SZB"]);
});

test("GET /api/destinations applies country and region filters", async () => {
  const { request, repository } = app();
  const response = await request("/api/destinations?origin_iata=KUL&region_group=EAST_ASIA&country_code=JP");
  const body = await json<{ destinations: AirportApiRecord[] }>(response);

  assert.deepEqual(body.destinations.map((destination) => destination.iata_code), ["NRT"]);
  assert.equal(repository.lastDestinationFilters?.origin_iata, "KUL");
  assert.equal(repository.lastDestinationFilters?.region_group, "EAST_ASIA");
});

test("GET /api/deals applies filters and returns score-sorted deal cards", async () => {
  const { request, repository } = app();
  const response = await request("/api/deals?origin=KUL&min_score=70&stay_length_days=5");
  const body = await json<{ deals: DealApiRecord[] }>(response);

  assert.equal(body.deals.length, 2);
  assert.deepEqual(body.deals.map((item) => item.destination), ["BKK", "NRT"]);
  assert.equal(repository.lastDealFilters?.origin_iata, "KUL");
  assert.equal(repository.lastDealFilters?.stay_length_days, 5);
  assert.equal(JSON.stringify(body).includes("revalidationPayload"), false);
});

test("GET /api/deals can exclude stale and expired records from live results", async () => {
  const { request } = app();
  const response = await request("/api/deals?only_recently_verified=true");
  const body = await json<{ deals: DealApiRecord[] }>(response);

  assert.deepEqual(body.deals.map((item) => item.destination), ["BKK"]);
  assert.equal(body.deals[0]?.is_live, true);
});

test("GET /api/price-history returns normalized history without raw payloads", async () => {
  const { request, repository } = app();
  const response = await request("/api/price-history?origin_iata=KUL&destination_iata=BKK&provider=mock");
  const body = await json<{ price_history: PriceHistoryApiRecord[] }>(response);

  assert.equal(body.price_history.length, 1);
  assert.equal(body.price_history[0]?.amount_minor_myr, 69_900);
  assert.equal(repository.lastPriceHistoryFilters?.provider_name, "mock");
  assert.equal(JSON.stringify(body).includes("raw"), false);
});

test("GET /api/provider-health includes Amadeus as disabled when credentials are missing", async () => {
  const { request } = app();
  const response = await request("/api/provider-health");
  const body = await json<{ providers: Array<{ provider_name: string; status: string; enabled: boolean }> }>(response);
  const amadeus = body.providers.find((provider) => provider.provider_name === "amadeus");

  assert.ok(amadeus);
  assert.equal(amadeus.enabled, false);
  assert.equal(amadeus.status, "disabled");
});

test("POST /api/admin/scan is disabled without ADMIN_TOKEN", async () => {
  const { request } = app();
  const response = await request("/api/admin/scan", { method: "POST" });
  const body = await json<{ error: string }>(response);

  assert.equal(response.status, 503);
  assert.equal(body.error, "admin_scan_disabled");
});

test("POST /api/admin/scan requires bearer token and runs injected scan", async () => {
  let called = false;
  const { request } = app({
    env: { ADMIN_TOKEN: "local-token" },
    runScan: async () => {
      called = true;
      return scanResult();
    }
  });

  const rejected = await request("/api/admin/scan", {
    method: "POST",
    headers: { Authorization: "Bearer wrong" }
  });
  assert.equal(rejected.status, 401);

  const accepted = await request("/api/admin/scan", {
    method: "POST",
    headers: { Authorization: "Bearer local-token" }
  });
  const body = await json<{ ok: boolean; result: ScanRunResult }>(accepted);

  assert.equal(accepted.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.result.jobsSucceeded, 1);
  assert.equal(called, true);
});

test("POST /api/admin/revalidate is authenticated and safely stubbed", async () => {
  const disabled = await app().request("/api/admin/revalidate", { method: "POST" });
  assert.equal(disabled.status, 503);

  const { request } = app({ env: { ADMIN_TOKEN: "local-token" } });
  const response = await request("/api/admin/revalidate", {
    method: "POST",
    headers: { Authorization: "Bearer local-token" }
  });
  const body = await json<{ error: string }>(response);

  assert.equal(response.status, 501);
  assert.equal(body.error, "revalidate_not_implemented");
});

test("GET /dashboard renders filters, deal cards, prices, provider, and stale warnings", async () => {
  const { request } = app();
  const response = await request("/dashboard?origin_iata=KUL");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<option value="JHB"/);
  assert.match(html, /<option value="KUL" selected/);
  assert.match(html, /EAST_ASIA/);
  assert.match(html, /BKK/);
  assert.match(html, /RM699\.00/);
  assert.match(html, /Baseline RM999\.00/);
  assert.match(html, /30\.03%/);
  assert.match(html, /Provider/);
  assert.match(html, /mock/);
  assert.match(html, /Stale fare\. Revalidate before alert or purchase\./);
  assert.match(html, /Expired offer\. Do not treat as live fare\./);
  assert.match(html, /Needs revalidation/);
});

test("unsupported methods and paths return safe JSON errors", async () => {
  const { request } = app();
  const method = await request("/api/origins", { method: "POST" });
  const missing = await request("/nope");

  assert.equal(method.status, 405);
  assert.equal(missing.status, 404);
});

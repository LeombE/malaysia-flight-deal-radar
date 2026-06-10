import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderCheckReport, formatProviderCheckReport } from "../src/providers/provider-check.ts";
import { runDuffelSmoke } from "../src/providers/duffel/smoke.ts";

const NOW = Date.parse("2026-06-11T08:00:00.000Z");
const TEST_TOKEN = "duffel_test_secret_token";
const LIVE_TOKEN = "duffel_live_secret_token";

function safeEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    ENABLE_REAL_PROVIDERS: "true",
    REAL_PROVIDER_DRY_RUN: "false",
    DEFAULT_REAL_PROVIDER: "duffel",
    DUFFEL_ACCESS_TOKEN: TEST_TOKEN,
    DUFFEL_API_BASE_URL: "https://api.duffel.test",
    MAX_REAL_PROVIDER_SEARCHES_PER_RUN: "1",
    MAX_REAL_PROVIDER_DAILY_BUDGET: "1",
    DUFFEL_RETENTION_MODE: "NO_CACHE",
    DUFFEL_CURRENCY_CODE: "MYR",
    ...overrides
  };
}

function safeRoute() {
  return {
    originIata: "KUL",
    destinationIata: "SIN",
    departureDate: "2026-09-01",
    returnDate: "2026-09-06"
  };
}

function duffelOffer(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "off_smoke",
    total_amount: "388.00",
    total_currency: "MYR",
    expires_at: "2026-06-11T08:30:00.000Z",
    slices: [
      {
        origin: { iata_code: "KUL" },
        destination: { iata_code: "SIN" },
        departure_date: "2026-09-01",
        duration: "PT1H10M",
        segments: [{
          origin: { iata_code: "KUL" },
          destination: { iata_code: "SIN" },
          departing_at: "2026-09-01T08:00:00",
          arriving_at: "2026-09-01T09:10:00",
          duration: "PT1H10M",
          marketing_carrier: { iata_code: "MH" },
          passengers: [{ cabin_class: "economy" }],
          stops: [],
          raw_marker: "segment-raw-marker"
        }]
      },
      {
        origin: { iata_code: "SIN" },
        destination: { iata_code: "KUL" },
        departure_date: "2026-09-06",
        duration: "PT1H15M",
        segments: [{
          origin: { iata_code: "SIN" },
          destination: { iata_code: "KUL" },
          departing_at: "2026-09-06T18:00:00",
          arriving_at: "2026-09-06T19:15:00",
          duration: "PT1H15M",
          marketing_carrier: { iata_code: "MH" },
          passengers: [{ cabin_class: "economy" }],
          stops: []
        }]
      }
    ],
    raw_secret_marker: "do-not-print-raw-payload",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("duffel smoke refuses without ENABLE_REAL_PROVIDERS=true and makes no network call", async () => {
  let calls = 0;
  const result = await runDuffelSmoke({
    env: safeEnv({ ENABLE_REAL_PROVIDERS: "false" }),
    input: safeRoute(),
    now: () => NOW,
    fetch: async () => {
      calls += 1;
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("real_providers_disabled"), true);
  assert.equal(result.output.includes("No Duffel network call was made."), true);
  assert.equal(calls, 0);
});

test("duffel smoke refuses when REAL_PROVIDER_DRY_RUN=true", async () => {
  const result = await runDuffelSmoke({
    env: safeEnv({ REAL_PROVIDER_DRY_RUN: "true" }),
    input: safeRoute(),
    now: () => NOW,
    fetch: async () => {
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("dry_run_enabled"), true);
});

test("duffel smoke refuses missing DUFFEL_ACCESS_TOKEN", async () => {
  const result = await runDuffelSmoke({
    env: safeEnv({ DUFFEL_ACCESS_TOKEN: "" }),
    input: safeRoute(),
    now: () => NOW,
    fetch: async () => {
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("credentials_missing"), true);
});

test("duffel smoke refuses non-test token", async () => {
  const result = await runDuffelSmoke({
    env: safeEnv({ DUFFEL_ACCESS_TOKEN: LIVE_TOKEN }),
    input: safeRoute(),
    now: () => NOW,
    fetch: async () => {
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("non_test_token"), true);
  assert.equal(result.output.includes(LIVE_TOKEN), false);
});

test("duffel smoke refuses when DEFAULT_REAL_PROVIDER is not duffel", async () => {
  const result = await runDuffelSmoke({
    env: safeEnv({ DEFAULT_REAL_PROVIDER: "amadeus" }),
    input: safeRoute(),
    now: () => NOW,
    fetch: async () => {
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("provider_not_selected"), true);
});

test("duffel smoke refuses when search limit is greater than safe threshold", async () => {
  const result = await runDuffelSmoke({
    env: safeEnv({ MAX_REAL_PROVIDER_SEARCHES_PER_RUN: "2" }),
    input: safeRoute(),
    now: () => NOW,
    fetch: async () => {
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("unsafe_search_limit"), true);
});

test("provider check prints readiness without secrets", () => {
  const records = buildProviderCheckReport({
    env: safeEnv({
      AMADEUS_CLIENT_ID: "amadeus-client-id",
      AMADEUS_CLIENT_SECRET: "amadeus-secret"
    }),
    now: () => NOW
  });
  const output = formatProviderCheckReport(records);

  assert.equal(records.some((record) => record.provider_name === "mock"), true);
  assert.equal(records.some((record) => record.provider_name === "amadeus"), true);
  assert.equal(records.some((record) => record.provider_name === "duffel"), true);
  assert.equal(output.includes(TEST_TOKEN), false);
  assert.equal(output.includes("amadeus-secret"), false);
  assert.match(output, /can_search_live:/);
  assert.match(output, /blocking_reasons:/);
});

test("duffel smoke output does not include raw provider payload", async () => {
  let calls = 0;
  const result = await runDuffelSmoke({
    env: safeEnv(),
    input: safeRoute(),
    now: () => NOW,
    fetch: async (url) => {
      calls += 1;
      if (String(url).includes("/air/offers/off_smoke")) {
        return jsonResponse({ data: duffelOffer({ public_url: "https://duffel.test/off_smoke" }) });
      }
      return jsonResponse({ data: { offers: [duffelOffer()] } });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.output.includes("raw_secret_marker"), false);
  assert.equal(result.output.includes("do-not-print-raw-payload"), false);
  assert.equal(result.output.includes("segment-raw-marker"), false);
  assert.equal(result.output.includes(TEST_TOKEN), false);
  assert.match(result.output, /"provider": "duffel"/);
  assert.match(result.output, /"price_myr": "RM388.00"/);
  assert.match(result.output, /"last_revalidated_at":/);
});

test("duffel smoke guard failures avoid real network calls", async () => {
  let calls = 0;
  const result = await runDuffelSmoke({
    env: safeEnv({
      ENABLE_REAL_PROVIDERS: "false",
      REAL_PROVIDER_DRY_RUN: "true",
      DUFFEL_ACCESS_TOKEN: ""
    }),
    input: safeRoute(),
    now: () => NOW,
    fetch: async () => {
      calls += 1;
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.length >= 3, true);
  assert.equal(calls, 0);
});

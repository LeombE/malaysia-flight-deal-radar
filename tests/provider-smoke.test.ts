import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderCheckReport, formatProviderCheckReport } from "../src/providers/provider-check.ts";
import { resolveDuffelSmokeInput, runDuffelSmoke } from "../src/providers/duffel/smoke.ts";
import {
  resolveTravelpayoutsSmokeInput,
  runTravelpayoutsSmoke,
  travelpayoutsSmokeStatusFromResult
} from "../src/providers/travelpayouts/smoke.ts";

const NOW = Date.parse("2026-06-11T08:00:00.000Z");
const TEST_TOKEN = "duffel_test_secret_token";
const LIVE_TOKEN = "duffel_live_secret_token";
const TRAVELPAYOUTS_TOKEN = "travelpayouts_secret_token";

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

function travelpayoutsEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    ENABLE_CACHED_FARE_PROVIDER: "true",
    CACHED_PROVIDER_DRY_RUN: "false",
    DEFAULT_CACHED_PROVIDER: "travelpayouts",
    TRAVELPAYOUTS_TOKEN,
    TRAVELPAYOUTS_API_BASE_URL: "https://api.travelpayouts.test",
    TRAVELPAYOUTS_CURRENCY: "MYR",
    TRAVELPAYOUTS_RETENTION_MODE: "AGGREGATE_ONLY",
    TRAVELPAYOUTS_TIMEOUT_MS: "10000",
    TRAVELPAYOUTS_RETRY_LIMIT: "0",
    ...overrides
  };
}

function travelpayoutsRoute() {
  return {
    originIata: "KUL",
    destinationIata: "TPE",
    departureAt: "2026-09-01",
    departDate: "2026-09-01",
    returnDate: "2026-09-06",
    tripDuration: 5
  };
}

function travelpayoutsPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    error: null,
    data: [{
      origin: "KUL",
      destination: "TPE",
      depart_date: "2026-09-01",
      return_date: "2026-09-06",
      value: 459,
      airline: "D7",
      number_of_changes: 0,
      found_at: "2026-06-11T07:30:00.000Z",
      raw_marker: "raw-travelpayouts-payload",
      ...overrides
    }]
  };
}

test("smoke route env vars override defaults", () => {
  const input = resolveDuffelSmokeInput(undefined, {
    DUFFEL_SMOKE_ORIGIN: "hnd",
    DUFFEL_SMOKE_DESTINATION: "tpe",
    DUFFEL_SMOKE_DEPARTURE_DATE: "2026-10-01",
    DUFFEL_SMOKE_RETURN_DATE: "2026-10-08",
    DUFFEL_SMOKE_CABIN_CLASS: "ECONOMY",
    DUFFEL_SMOKE_ADULTS: "2",
    DUFFEL_SMOKE_CURRENCY: "myr"
  }, NOW);

  assert.deepEqual(input, {
    profile: "default",
    originIata: "HND",
    destinationIata: "TPE",
    departureDate: "2026-10-01",
    returnDate: "2026-10-08",
    cabinClass: "economy",
    adults: 2,
    currency: "MYR"
  });
});

test("Duffel Airways test route profile builds LHR-JFK request safely", async () => {
  let requestBody: unknown;
  const result = await runDuffelSmoke({
    env: safeEnv({
      DUFFEL_SMOKE_PROFILE: "duffel-airways",
      DUFFEL_SMOKE_DEPARTURE_DATE: "2026-10-01",
      DUFFEL_SMOKE_RETURN_DATE: "2026-10-08"
    }),
    now: () => NOW,
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({ data: { offers: [] } });
    }
  });

  const data = (requestBody as { data: { slices: unknown[]; cabin_class: string; passengers: unknown[] } }).data;
  assert.equal(result.ok, true);
  assert.equal(result.summary?.origin, "LHR");
  assert.equal(result.summary?.destination, "JFK");
  assert.deepEqual(data.slices, [
    { origin: "LHR", destination: "JFK", departure_date: "2026-10-01" },
    { origin: "JFK", destination: "LHR", departure_date: "2026-10-08" }
  ]);
  assert.equal(data.cabin_class, "economy");
  assert.deepEqual(data.passengers, [{ type: "adult" }]);
});

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
    lastSmoke: [{
      provider_name: "duffel",
      status: "no_offers_returned",
      offers_returned: 0,
      checked_at: "2026-06-11T08:05:00.000Z",
      origin: "KUL",
      destination: "SIN",
      departure_date: "2026-09-01",
      return_date: "2026-09-06"
    }],
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
  assert.match(output, /readiness_passed:/);
  assert.match(output, /last_smoke: no_offers_returned, offers_returned=0/);
});

test("no-offers smoke response is successful and not a credential failure", async () => {
  let calls = 0;
  const result = await runDuffelSmoke({
    env: safeEnv(),
    input: safeRoute(),
    now: () => NOW,
    fetch: async () => {
      calls += 1;
      return jsonResponse({ data: { offers: [] } });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(calls, 1);
  assert.equal(result.summary?.offers_returned, 0);
  assert.equal(result.summary?.no_offers_returned, true);
  assert.match(result.output, /API call succeeded/);
  assert.match(result.output, /No offers returned/);
  assert.match(result.output, /sandbox route\/date availability issue/);
  assert.match(result.output, /not a provider credential failure/);
  assert.match(result.output, /Duffel Airways sandbox profile/);
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

test("Travelpayouts smoke route env vars override defaults", () => {
  const input = resolveTravelpayoutsSmokeInput(undefined, {
    TRAVELPAYOUTS_SMOKE_ORIGIN: "szb",
    TRAVELPAYOUTS_SMOKE_DESTINATION: "bkk",
    TRAVELPAYOUTS_SMOKE_DEPARTURE_DATE: "2026-10-01",
    TRAVELPAYOUTS_SMOKE_RETURN_DATE: "2026-10-06",
    TRAVELPAYOUTS_SMOKE_ENDPOINT: "month-matrix",
    TRAVELPAYOUTS_SMOKE_CURRENCY: "myr",
    TRAVELPAYOUTS_SMOKE_LIMIT: "7"
  }, NOW);

  assert.deepEqual(input, {
    originIata: "SZB",
    destinationIata: "BKK",
    departureAt: "2026-10-01",
    departDate: "2026-10-01",
    returnDate: "2026-10-06",
    endpoint: "v2/prices/month-matrix",
    currency: "MYR",
    limit: 7,
    tripDuration: 5
  });
});

test("Travelpayouts smoke refuses when cached provider is disabled and makes no network call", async () => {
  let calls = 0;
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv({ ENABLE_CACHED_FARE_PROVIDER: "false" }),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => {
      calls += 1;
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("cached_provider_disabled"), true);
  assert.match(result.output, /No Travelpayouts network call was made/);
  assert.equal(calls, 0);
});

test("Travelpayouts smoke refuses when dry-run is enabled", async () => {
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv({ CACHED_PROVIDER_DRY_RUN: "true" }),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => {
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("dry_run_enabled"), true);
});

test("Travelpayouts smoke refuses missing token", async () => {
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv({ TRAVELPAYOUTS_TOKEN: "" }),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => {
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("credentials_missing"), true);
  assert.equal(result.output.includes(TRAVELPAYOUTS_TOKEN), false);
});

test("Travelpayouts smoke refuses when default cached provider is not Travelpayouts", async () => {
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv({ DEFAULT_CACHED_PROVIDER: "other" }),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => {
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("provider_not_selected"), true);
});

test("Travelpayouts smoke refuses unsafe limits and unsupported endpoints", async () => {
  let calls = 0;
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: {
      ...travelpayoutsRoute(),
      endpoint: "v2/prices/unknown",
      limit: 50
    },
    now: () => NOW,
    fetch: async () => {
      calls += 1;
      throw new Error("network should not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockingReasons.includes("unsafe_limit"), true);
  assert.equal(result.blockingReasons.includes("unsupported_endpoint"), true);
  assert.equal(calls, 0);
});

test("Travelpayouts smoke normalizes mocked response and does not expose token or raw payload", async () => {
  let capturedUrl = "";
  let capturedToken = "";
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async (url, init) => {
      capturedUrl = String(url);
      capturedToken = new Headers(init?.headers).get("x-access-token") ?? "";
      return jsonResponse(travelpayoutsPayload());
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary?.rows_returned, 1);
  assert.equal(result.summary?.price_myr, "RM459.00");
  assert.equal(result.summary?.original_currency, "MYR");
  assert.equal(result.summary?.carrier, "D7");
  assert.equal(result.summary?.stops, 0);
  assert.equal(result.summary?.freshness_label, "fresh");
  assert.match(result.summary?.cache_warning ?? "", /Recheck before purchase/);
  assert.match(capturedUrl, /\/v2\/prices\/latest/);
  assert.match(capturedUrl, /origin=KUL/);
  assert.match(capturedUrl, /destination=TPE/);
  assert.match(capturedUrl, /limit=5/);
  assert.equal(capturedUrl.includes(TRAVELPAYOUTS_TOKEN), false);
  assert.equal(capturedToken, TRAVELPAYOUTS_TOKEN);
  assert.equal(result.output.includes(TRAVELPAYOUTS_TOKEN), false);
  assert.equal(result.output.includes("x-access-token"), false);
  assert.equal(result.output.includes("raw-travelpayouts-payload"), false);
});

test("Travelpayouts smoke labels cached and expired fares correctly", async () => {
  const cached = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => jsonResponse(travelpayoutsPayload({
      found_at: "2026-05-01T00:00:00.000Z"
    }))
  });
  const expired = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => jsonResponse(travelpayoutsPayload({
      found_at: "2026-05-01T00:00:00.000Z",
      expires_at: "2026-06-01T00:00:00.000Z"
    }))
  });

  assert.equal(cached.summary?.freshness_label, "cached");
  assert.equal(expired.summary?.freshness_label, "expired");
  assert.equal(cached.summary?.readiness_status.live_guarantee, false);
  assert.equal(expired.summary?.readiness_status.cached_data_source, true);
});

test("Travelpayouts smoke treats zero rows as successful cached-data miss", async () => {
  let calls = 0;
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => {
      calls += 1;
      return jsonResponse({ success: true, error: null, data: [] });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(calls, 1);
  assert.equal(result.summary?.rows_returned, 0);
  assert.equal(result.summary?.no_rows_returned, true);
  assert.match(result.output, /API call succeeded/);
  assert.match(result.output, /No cached fare rows returned/);
  assert.match(result.output, /not a credential failure/);
});

test("Travelpayouts smoke failure output is sanitized", async () => {
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => jsonResponse({
      success: false,
      error: `bad token ${TRAVELPAYOUTS_TOKEN}`,
      data: []
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.output.includes(TRAVELPAYOUTS_TOKEN), false);
  assert.equal(result.output.includes("bad token"), false);
  assert.match(result.output, /Travelpayouts smoke failed/);
});

test("provider check includes Travelpayouts last smoke rows without exposing secrets", async () => {
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => jsonResponse({ success: true, error: null, data: [] })
  });
  const records = buildProviderCheckReport({
    env: travelpayoutsEnv(),
    lastSmoke: [travelpayoutsSmokeStatusFromResult(result, "2026-06-11T08:05:00.000Z")],
    now: () => NOW
  });
  const output = formatProviderCheckReport(records);

  assert.match(output, /travelpayouts/);
  assert.match(output, /cached_data_source: true/);
  assert.match(output, /live_guarantee: false/);
  assert.match(output, /can_search_cached: true/);
  assert.match(output, /last_smoke: no_rows_returned, rows_returned=0/);
  assert.equal(output.includes(TRAVELPAYOUTS_TOKEN), false);
});


test("Travelpayouts smoke classifies HTTP 400 as request_shape_error, not credential failure", async () => {
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: travelpayoutsRoute(),
    now: () => NOW,
    fetch: async () => jsonResponse({ success: false, error: `bad ${TRAVELPAYOUTS_TOKEN}`, data: null }, 400)
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorClassification, "request_shape_error");
  assert.match(result.output, /Error classification: request_shape_error/);
  assert.equal(result.output.includes("credential"), false);
  assert.equal(result.output.includes(TRAVELPAYOUTS_TOKEN), false);
});

test("Travelpayouts smoke classifies HTTP 401 and 403 as credential or access issue", async () => {
  for (const status of [401, 403]) {
    const result = await runTravelpayoutsSmoke({
      env: travelpayoutsEnv(),
      input: travelpayoutsRoute(),
      now: () => NOW,
      fetch: async () => jsonResponse({ success: false, error: "auth", data: null }, status)
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorClassification, "credential_or_access_issue");
    assert.match(result.output, /Error classification: credential_or_access_issue/);
    assert.equal(result.output.includes(TRAVELPAYOUTS_TOKEN), false);
  }
});

test("Travelpayouts smoke supports v3 prices for dates with safe query keys", async () => {
  let capturedUrl = "";
  const result = await runTravelpayoutsSmoke({
    env: travelpayoutsEnv(),
    input: {
      ...travelpayoutsRoute(),
      endpoint: "v3-prices-for-dates",
      departureAt: "2026-09",
      departDate: "2026-09-01",
      limit: 5
    },
    now: () => NOW,
    fetch: async (url) => {
      capturedUrl = String(url);
      return jsonResponse(travelpayoutsPayload({
        departure_at: "2026-09-01T08:00:00Z",
        return_at: "2026-09-06T18:00:00Z",
        price: 459
      }));
    }
  });

  assert.equal(result.ok, true);
  assert.match(capturedUrl, /\/aviasales\/v3\/prices_for_dates/);
  assert.match(capturedUrl, /departure_at=2026-09/);
  assert.match(capturedUrl, /return_at=2026-09-06/);
  assert.deepEqual(result.summary?.safe_query_keys, [
    "currency",
    "departure_at",
    "destination",
    "direct",
    "limit",
    "one_way",
    "origin",
    "page",
    "return_at",
    "sorting"
  ]);
  assert.equal(result.output.includes(TRAVELPAYOUTS_TOKEN), false);
  assert.equal(result.output.includes("raw-travelpayouts-payload"), false);
});

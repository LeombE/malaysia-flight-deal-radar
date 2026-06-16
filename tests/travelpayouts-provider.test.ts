import test from "node:test";
import assert from "node:assert/strict";
import { parseCachedProviderConfig } from "../src/config/cached-providers.ts";
import { parseTravelpayoutsConfig } from "../src/config/travelpayouts.ts";
import { createCachedProviderRegistry } from "../src/providers/cached-registry.ts";
import { buildProviderCheckReport, formatProviderCheckReport } from "../src/providers/provider-check.ts";
import { buildCachedProviderReadinessReports } from "../src/providers/readiness.ts";
import { TravelpayoutsProvider } from "../src/providers/travelpayouts/travelpayouts-provider.ts";
import type { PriceCalendarApiRecord } from "../src/routes/api-types.ts";

const NOW = new Date("2026-06-10T08:00:00.000Z");
const TOKEN = "travelpayouts-secret-token";

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    TRAVELPAYOUTS_TOKEN: TOKEN,
    TRAVELPAYOUTS_API_BASE_URL: "https://api.travelpayouts.test",
    TRAVELPAYOUTS_CURRENCY: "MYR",
    TRAVELPAYOUTS_RETENTION_MODE: "AGGREGATE_ONLY",
    TRAVELPAYOUTS_TIMEOUT_MS: "10000",
    TRAVELPAYOUTS_RETRY_LIMIT: "1",
    ENABLE_CACHED_FARE_PROVIDER: "true",
    CACHED_PROVIDER_DRY_RUN: "false",
    DEFAULT_CACHED_PROVIDER: "travelpayouts",
    ...overrides
  };
}

function provider(
  environment: Record<string, string | undefined>,
  fetchImpl: typeof fetch = async () => jsonResponse({ success: true, data: [], error: null })
): TravelpayoutsProvider {
  return new TravelpayoutsProvider(
    parseTravelpayoutsConfig(environment),
    parseCachedProviderConfig(environment),
    {
      fetch: fetchImpl,
      now: () => NOW.getTime(),
      sleep: async () => {}
    }
  );
}

function searchInput() {
  return {
    originIata: "KUL",
    destinationIata: "TPE",
    departureFrom: "2026-07-01",
    departureTo: "2026-07-31",
    stayLengthDays: 5,
    adults: 1,
    cabinClass: "economy" as const,
    limit: 30
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

function latestPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    error: null,
    data: [
      {
        origin: "KUL",
        destination: "TPE",
        depart_date: "2026-07-25",
        return_date: "2026-07-30",
        number_of_changes: 0,
        value: 459,
        airline: "D7",
        flight_number: 376,
        found_at: "2026-06-10T06:00:00.000Z",
        actual: true,
        ...overrides
      }
    ]
  };
}

test("Travelpayouts provider is disabled by default and missing token blocks search", async () => {
  let calls = 0;
  const disabled = provider({}, async () => {
    calls += 1;
    throw new Error("network must not be called");
  });

  assert.equal(disabled.isEnabled(), false);
  assert.deepEqual(await disabled.searchLatest(searchInput()), []);
  assert.equal((await disabled.getProviderHealth()).status, "disabled");
  assert.equal(calls, 0);

  const missingToken = provider(env({ TRAVELPAYOUTS_TOKEN: "" }), async () => {
    calls += 1;
    throw new Error("network must not be called");
  });
  assert.equal(missingToken.isEnabled(), false);
  assert.deepEqual(await missingToken.searchLatest(searchInput()), []);
  assert.equal(calls, 0);
});

test("Travelpayouts dry-run and default provider guard block cached search", async () => {
  const dryRun = provider(env({ CACHED_PROVIDER_DRY_RUN: "true" }));
  const wrongDefault = provider(env({ DEFAULT_CACHED_PROVIDER: "other" }));

  assert.equal(dryRun.isEnabled(), false);
  assert.equal(wrongDefault.isEnabled(), false);
});

test("Travelpayouts readiness reports cached source without live guarantee", () => {
  const environment = env();
  const providers = createCachedProviderRegistry(environment, {
    fetch: async () => {
      throw new Error("readiness must not call network");
    },
    now: () => NOW.getTime()
  });
  const reports = buildCachedProviderReadinessReports({
    providers,
    env: environment,
    config: parseCachedProviderConfig(environment)
  });
  const report = reports.find((item) => item.provider_name === "travelpayouts");

  assert.ok(report);
  assert.equal(report.credentials_configured, true);
  assert.equal(report.cached_data_source, true);
  assert.equal(report.live_guarantee, false);
  assert.equal(report.can_search_cached, true);
  assert.equal(report.can_search_live, false);
  assert.equal(report.can_revalidate_live, false);
});

test("Travelpayouts latest request uses token header and normalizes cached fare rows", async () => {
  let capturedUrl = "";
  let capturedToken = "";
  const subject = provider(env(), async (input, init) => {
    capturedUrl = String(input);
    capturedToken = new Headers(init?.headers).get("x-access-token") ?? "";
    return jsonResponse(latestPayload());
  });

  const rows = await subject.searchLatest(searchInput());

  assert.match(capturedUrl, /\/v2\/prices\/latest/);
  assert.match(capturedUrl, /origin=KUL/);
  assert.match(capturedUrl, /destination=TPE/);
  assert.match(capturedUrl, /currency=MYR/);
  assert.equal(capturedUrl.includes(TOKEN), false);
  assert.equal(capturedToken, TOKEN);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.amount_minor_myr, 45_900);
  assert.equal(rows[0]?.original_currency, "MYR");
  assert.equal(rows[0]?.airline_iata, "D7");
  assert.equal(rows[0]?.stops, 0);
  assert.equal(rows[0]?.freshness_label, "fresh");
  assert.equal(rows[0]?.is_live, false);
  assert.equal(rows[0]?.is_bookable_claim, false);
  assert.match(rows[0]?.warning ?? "", /Recheck before purchase/);
});

test("Travelpayouts month and week matrix responses normalize object-shaped data", async () => {
  const body = {
    success: true,
    error: null,
    data: {
      "2026-07-25": {
        origin: "KUL",
        destination: "BKK",
        depart_date: "2026-07-25",
        return_date: "2026-07-30",
        transfers: 1,
        price: 441,
        airline: "AK",
        flight_number: "884",
        found_at: "2026-06-09T12:00:00.000Z"
      }
    }
  };
  const subject = provider(env(), async () => jsonResponse(body));

  const monthRows = await subject.searchMonthMatrix({ ...searchInput(), destinationIata: "BKK" });
  const weekRows = await subject.searchWeekMatrix({ ...searchInput(), destinationIata: "BKK" });

  for (const rows of [monthRows, weekRows]) {
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.destination_iata, "BKK");
    assert.equal(rows[0]?.destination_region, "SOUTHEAST_ASIA");
    assert.equal(rows[0]?.amount_minor_myr, 44_100);
    assert.equal(rows[0]?.stops, 1);
  }
});

test("Travelpayouts non-MYR rows keep original currency without fake conversion", async () => {
  const subject = provider(env({ TRAVELPAYOUTS_CURRENCY: "USD" }), async () => jsonResponse(latestPayload({ value: 99 })));
  const rows = await subject.searchLatest(searchInput());

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.amount_minor_myr, null);
  assert.equal(rows[0]?.display_price_rm, "Unavailable");
  assert.equal(rows[0]?.original_amount, 99);
  assert.equal(rows[0]?.original_currency, "USD");
});

test("Travelpayouts expired fares are marked expired and never live", async () => {
  const subject = provider(env(), async () => jsonResponse(latestPayload({
    expires_at: "2026-06-01T00:00:00.000Z",
    found_at: "2026-05-20T00:00:00.000Z"
  })));
  const rows = await subject.searchLatest(searchInput());

  assert.equal(rows[0]?.freshness_label, "expired");
  assert.equal(rows[0]?.is_live, false);
  assert.equal(rows[0]?.is_bookable_claim, false);
});

test("Travelpayouts errors are sanitized and token is never exposed", async () => {
  const subject = provider(env(), async () => jsonResponse({ success: false, data: null, error: `bad ${TOKEN}` }));

  await assert.rejects(
    subject.searchLatest(searchInput()),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(message.includes(TOKEN), false);
      assert.match(message, /Travelpayouts API error/);
      return true;
    }
  );
});

test("provider check includes Travelpayouts without exposing secrets", () => {
  const records = buildProviderCheckReport({ env: env() });
  const output = formatProviderCheckReport(records);
  const travelpayouts = records.find((record) => record.provider_name === "travelpayouts");

  assert.ok(travelpayouts);
  assert.equal(travelpayouts.configured, true);
  assert.equal(travelpayouts.cached_data_source, true);
  assert.equal(travelpayouts.live_guarantee, false);
  assert.equal(travelpayouts.can_search_cached, true);
  assert.equal(output.includes(TOKEN), false);
  assert.equal(output.includes("x-access-token"), false);
});

test("Travelpayouts normalized rows do not expose raw provider payload", async () => {
  const subject = provider(env(), async () => jsonResponse(latestPayload({ secret_raw_field: "raw-value" })));
  const rows: PriceCalendarApiRecord[] = await subject.searchLatest(searchInput());
  const serialized = JSON.stringify(rows);

  assert.equal(serialized.includes("secret_raw_field"), false);
  assert.equal(serialized.includes("raw-value"), false);
});

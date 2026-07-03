import test from "node:test";
import assert from "node:assert/strict";
import type { PriceCalendarApiRecord } from "../src/routes/api-types.ts";
import {
  buildTravelpayoutsPriceCalendarUpsertSql,
  buildTravelpayoutsImportVerifySql,
  resolveTravelpayoutsImportInput,
  runTravelpayoutsImportLocal,
  stableTravelpayoutsCalendarDedupeKey,
  stableTravelpayoutsCalendarId
} from "../src/providers/travelpayouts/import-local.ts";

const NOW = Date.parse("2026-07-03T08:00:00.000Z");
const TOKEN = "travelpayouts_secret_import_token";

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    ENABLE_CACHED_FARE_PROVIDER: "true",
    CACHED_PROVIDER_DRY_RUN: "false",
    DEFAULT_CACHED_PROVIDER: "travelpayouts",
    TRAVELPAYOUTS_TOKEN: TOKEN,
    TRAVELPAYOUTS_API_BASE_URL: "https://api.travelpayouts.test",
    TRAVELPAYOUTS_CURRENCY: "MYR",
    TRAVELPAYOUTS_RETENTION_MODE: "AGGREGATE_ONLY",
    TRAVELPAYOUTS_TIMEOUT_MS: "10000",
    TRAVELPAYOUTS_RETRY_LIMIT: "0",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function payload(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    error: null,
    data: [{
      origin: "KUL",
      destination: "BKK",
      depart_date: "2026-08-17",
      return_date: "2026-08-22",
      value: 388,
      airline: "AK",
      flight_number: "884",
      number_of_changes: 0,
      found_at: "2026-07-03T07:30:00.000Z",
      expires_at: "2026-07-05T07:30:00.000Z",
      raw_secret_marker: "raw-provider-payload",
      ...overrides
    }]
  };
}

function calendarRow(overrides: Partial<PriceCalendarApiRecord> = {}): PriceCalendarApiRecord {
  return {
    origin_iata: "KUL",
    destination_iata: "BKK",
    destination_country: "TH",
    destination_region: "SOUTHEAST_ASIA",
    departure_date: "2026-08-17",
    return_date: "2026-08-22",
    stay_length_days: 5,
    trip_type: "round_trip",
    cabin_class: "economy",
    adults: 1,
    amount_minor_myr: 38_800,
    display_price_rm: "RM388.00",
    original_amount: 388,
    original_currency: "MYR",
    airline_iata: "AK",
    flight_number: "884",
    stops: 0,
    total_duration_minutes: null,
    provider_name: "travelpayouts",
    source_endpoint: "v2/prices/week-matrix",
    retrieved_at: "2026-07-03T07:30:00.000Z",
    expires_at: "2026-07-05T07:30:00.000Z",
    freshness_label: "fresh",
    is_live: false,
    is_bookable_claim: false,
    search_link: "https://www.aviasales.com/search/KUL260817BKK2608221",
    warning: "Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.",
    deal_label: null,
    deal_score: null,
    ...overrides
  };
}

test("Travelpayouts local import defaults to safe local KUL-BKK week-matrix input", () => {
  const input = resolveTravelpayoutsImportInput(undefined, {});

  assert.equal(input.target, "local");
  assert.equal(input.originIata, "KUL");
  assert.equal(input.destinationIata, "BKK");
  assert.equal(input.endpoint, "v2/prices/week-matrix");
  assert.equal(input.currency, "MYR");
  assert.equal(input.departDate, "2026-08-17");
  assert.equal(input.returnDate, "2026-08-22");
  assert.equal(input.tripDuration, 5);
  assert.equal(input.limit, 5);
});

test("Travelpayouts local import gates reject unsafe states without fetch or D1 execution", async () => {
  const cases: Array<[Record<string, string | undefined>, Record<string, unknown>, string]> = [
    [{ ENABLE_CACHED_FARE_PROVIDER: "false" }, {}, "cached_provider_disabled"],
    [{ CACHED_PROVIDER_DRY_RUN: "true" }, {}, "dry_run_enabled"],
    [{ TRAVELPAYOUTS_TOKEN: "" }, {}, "credentials_missing"],
    [{ DEFAULT_CACHED_PROVIDER: "other" }, {}, "provider_not_selected"],
    [{}, { target: "remote" }, "target_not_local"],
    [{}, { limit: 11 }, "unsafe_limit"],
    [{}, { destinationIata: "HND" }, "unsupported_destination"],
    [{}, { currency: "USD" }, "unsupported_currency"],
    [{}, { endpoint: "v3-prices-for-dates" }, "unsupported_endpoint"]
  ];

  for (const [envOverrides, input, expectedReason] of cases) {
    let fetchCalls = 0;
    let executeCalls = 0;
    const result = await runTravelpayoutsImportLocal({
      env: env(envOverrides),
      input,
      now: () => NOW,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("network must not be called");
      },
      executeSql: async () => {
        executeCalls += 1;
      }
    });

    assert.equal(result.ok, false);
    assert.equal(result.blockingReasons.includes(expectedReason as never), true);
    assert.equal(fetchCalls, 0);
    assert.equal(executeCalls, 0);
    assert.match(result.output, /No Travelpayouts network call was made/);
    assert.equal(result.output.includes(TOKEN), false);
  }
});

test("Travelpayouts local import treats zero rows as successful empty import", async () => {
  let fetchCalls = 0;
  let executeCalls = 0;
  const result = await runTravelpayoutsImportLocal({
    env: env(),
    now: () => NOW,
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse({ success: true, error: null, data: [] });
    },
    executeSql: async () => {
      executeCalls += 1;
    }
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCalls, 1);
  assert.equal(executeCalls, 0);
  assert.equal(result.summary?.rows_fetched, 0);
  assert.equal(result.summary?.rows_imported, 0);
  assert.match(result.output, /zero cached fare rows/);
});

test("Travelpayouts local import normalizes mocked rows into safe price_calendar_rows upsert SQL", async () => {
  let capturedUrl = "";
  let capturedToken = "";
  let executedSql = "";
  const result = await runTravelpayoutsImportLocal({
    env: env(),
    now: () => NOW,
    fetch: async (url, init) => {
      capturedUrl = String(url);
      capturedToken = new Headers(init?.headers).get("x-access-token") ?? "";
      return jsonResponse(payload());
    },
    executeSql: async (sql) => {
      executedSql = sql;
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary?.rows_fetched, 1);
  assert.equal(result.summary?.rows_imported, 1);
  assert.match(capturedUrl, /\/v2\/prices\/week-matrix/);
  assert.equal(capturedUrl.includes("limit="), false);
  assert.equal(capturedUrl.includes("trip_duration"), false);
  assert.equal(capturedUrl.includes(TOKEN), false);
  assert.equal(capturedToken, TOKEN);
  assert.match(executedSql, /INSERT INTO price_calendar_rows/);
  assert.match(executedSql, /provider_name/);
  assert.match(executedSql, /'travelpayouts'/);
  assert.match(executedSql, /'AGGREGATE_ONLY'/);
  assert.match(executedSql, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.match(executedSql, /retrieved_at = excluded\.retrieved_at/);
  assert.match(executedSql, /freshness_label = excluded\.freshness_label/);
  assert.match(executedSql, /search_link = excluded\.search_link/);
  assert.equal(executedSql.includes("raw-provider-payload"), false);
  assert.equal(executedSql.includes(TOKEN), false);
  assert.equal(result.output.includes(TOKEN), false);
  assert.equal(result.output.includes("x-access-token"), false);
});

test("Travelpayouts local import dry-run fetches and plans rows without D1 execution", async () => {
  let executeCalls = 0;
  const result = await runTravelpayoutsImportLocal({
    env: env(),
    input: { dryRunImport: true },
    now: () => NOW,
    fetch: async () => jsonResponse(payload()),
    executeSql: async () => {
      executeCalls += 1;
    }
  });

  assert.equal(result.ok, true);
  assert.equal(executeCalls, 0);
  assert.equal(result.summary?.rows_planned, 1);
  assert.equal(result.summary?.rows_imported, 0);
  assert.match(result.output, /Dry-run import only/);
});

test("Travelpayouts deterministic import ID excludes retrieved_at and updates mutable fields on conflict", () => {
  const first = calendarRow({ retrieved_at: "2026-07-03T07:30:00.000Z" });
  const second = calendarRow({
    retrieved_at: "2026-07-04T07:30:00.000Z",
    expires_at: "2026-07-06T07:30:00.000Z",
    freshness_label: "recent",
    warning: "Cached row changed. Recheck before purchase.",
    search_link: "https://www.aviasales.com/search/changed"
  });
  const differentFlight = calendarRow({ flight_number: "999" });

  assert.equal(stableTravelpayoutsCalendarId(first), stableTravelpayoutsCalendarId(second));
  assert.equal(stableTravelpayoutsCalendarDedupeKey(first).includes(first.retrieved_at), false);
  assert.equal(stableTravelpayoutsCalendarId(first) === stableTravelpayoutsCalendarId(differentFlight), false);

  const sql = buildTravelpayoutsPriceCalendarUpsertSql([second]);
  assert.match(sql, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.match(sql, /retrieved_at = excluded\.retrieved_at/);
  assert.match(sql, /expires_at = excluded\.expires_at/);
  assert.match(sql, /warning = excluded\.warning/);
  assert.match(sql, /updated_at = strftime/);
});

test("Travelpayouts import SQL always writes non-live non-bookable normalized rows only", () => {
  const sql = buildTravelpayoutsPriceCalendarUpsertSql([calendarRow()]);

  assert.match(sql, /is_live/);
  assert.match(sql, /is_bookable_claim/);
  assert.match(sql, /, 0, 0, /);
  assert.equal(sql.includes("raw_payload"), false);
  assert.equal(sql.includes("x-access-token"), false);
  assert.equal(sql.includes(TOKEN), false);
});

test("Travelpayouts import latest endpoint supports period_type without unsupported week params", async () => {
  let capturedUrl = "";
  const result = await runTravelpayoutsImportLocal({
    env: env(),
    input: { endpoint: "latest", periodType: "year", dryRunImport: true },
    now: () => NOW,
    fetch: async (url) => {
      capturedUrl = String(url);
      return jsonResponse({ success: true, error: null, data: [] });
    }
  });
  const url = new URL(capturedUrl);

  assert.equal(result.ok, true);
  assert.equal(url.pathname, "/v2/prices/latest");
  assert.equal(url.searchParams.get("period_type"), "year");
  assert.equal(url.searchParams.has("depart_date"), false);
  assert.equal(url.searchParams.has("return_date"), false);
  assert.deepEqual(result.summary?.safe_query_keys, [
    "beginning_of_period",
    "currency",
    "destination",
    "limit",
    "one_way",
    "origin",
    "page",
    "period_type",
    "show_to_affiliates",
    "sorting",
    "trip_class",
    "trip_duration"
  ]);
});

test("Travelpayouts import verification SQL is read-only and checks raw payload column absence", () => {
  const sql = buildTravelpayoutsImportVerifySql();

  assert.match(sql, /SELECT provider_name, COUNT\(\*\)/);
  assert.match(sql, /SELECT freshness_label, COUNT\(\*\)/);
  assert.match(sql, /price_calendar_rows/);
  assert.match(sql, /raw/);
  assert.match(sql, /payload/);
  assert.match(sql, /token/);
  assert.equal(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(sql), false);
});

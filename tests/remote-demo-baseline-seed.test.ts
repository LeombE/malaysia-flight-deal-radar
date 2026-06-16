import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MockProvider } from "../src/providers/mock-provider.ts";
import { scoreDeal } from "../src/scoring/deal-scoring.ts";
import type { HistoricalFareSample } from "../src/scoring/types.ts";

const SEED_SQL_PATH = "scripts/sql/remote-demo-baseline-seed.sql";
const VERIFY_SQL_PATH = "scripts/sql/remote-demo-baseline-verify.sql";
const CLEANUP_SQL_PATH = "scripts/sql/remote-demo-cleanup.sql";
const DEMO_NOW = new Date("2026-06-10T08:00:00.000Z");
const DEMO_DEPARTURE_DATE = "2026-07-25";
const DEMO_RETURN_DATE = "2026-07-30";

interface DemoRouteSeed {
  origin: string;
  destination: string;
  lowAmountMinorMyr: number;
  medianAmountMinorMyr: number;
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function routeKey(route: Pick<DemoRouteSeed, "origin" | "destination">): string {
  return `${route.origin}-${route.destination}`;
}

function parseRouteSeeds(sql: string): DemoRouteSeed[] {
  const routeBlock = sql.match(/demo_routes\(origin_iata, destination_iata, low_amount_minor_myr, median_amount_minor_myr\) AS \(\s*VALUES([\s\S]*?)\s*\),\s*samples/);
  assert.ok(routeBlock?.[1], "demo route CTE must be present");
  return [...routeBlock[1].matchAll(/\('([A-Z]{3})', '([A-Z]{3})', ([0-9]+), ([0-9]+)\)/g)].map((match) => ({
    origin: match[1] ?? "",
    destination: match[2] ?? "",
    lowAmountMinorMyr: Number.parseInt(match[3] ?? "0", 10),
    medianAmountMinorMyr: Number.parseInt(match[4] ?? "0", 10)
  }));
}

function parseSampleIndexes(sql: string): number[] {
  const sampleBlock = sql.match(/samples\(sample_index\) AS \(\s*VALUES([\s\S]*?)\s*\)\s*INSERT INTO/);
  assert.ok(sampleBlock?.[1], "sample index CTE must be present");
  return [...sampleBlock[1].matchAll(/\(([0-9]+)\)/g)].map((match) => Number.parseInt(match[1] ?? "0", 10));
}

function historicalSamplesFor(route: DemoRouteSeed, sampleIndexes: number[]): HistoricalFareSample[] {
  return sampleIndexes.map((sampleIndex) => ({
    amountMinorMyr: sampleIndex <= 2 ? route.lowAmountMinorMyr : route.medianAmountMinorMyr
  }));
}

test("remote demo seed SQL contains only mock provider demo data", () => {
  const sql = readText(SEED_SQL_PATH);

  assert.match(sql, /provider = 'mock'/);
  assert.match(sql, /'mock'/);
  assert.equal(/duffel|amadeus|skyscanner/i.test(sql), false);
  assert.equal(/DUFFEL_ACCESS_TOKEN|AMADEUS_CLIENT_SECRET|SKYSCANNER_API_KEY|TELEGRAM_BOT_TOKEN|ADMIN_TOKEN/.test(sql), false);
});

test("remote demo seed uses integer MYR minor units and at least 20 samples per target route", () => {
  const sql = readText(SEED_SQL_PATH);
  const routes = parseRouteSeeds(sql);
  const sampleIndexes = parseSampleIndexes(sql);

  assert.deepEqual(routes.map(routeKey).sort(), [
    "JHB-BKK",
    "KUL-BKK",
    "KUL-SIN",
    "KUL-TPE",
    "SZB-NRT"
  ]);
  assert.equal(sampleIndexes.length, 20);
  assert.deepEqual(sampleIndexes, Array.from({ length: 20 }, (_value, index) => index + 1));

  for (const route of routes) {
    assert.equal(Number.isInteger(route.lowAmountMinorMyr), true);
    assert.equal(Number.isInteger(route.medianAmountMinorMyr), true);
    assert.equal(route.lowAmountMinorMyr > 0, true);
    assert.equal(route.medianAmountMinorMyr > 0, true);
    assert.equal(historicalSamplesFor(route, sampleIndexes).length >= 20, true);
  }
});

test("remote demo seed is idempotent and avoids deleting non-demo data", () => {
  const sql = readText(SEED_SQL_PATH);

  assert.match(sql, /DELETE FROM fare_snapshots\s+WHERE provider = 'mock'\s+AND id LIKE 'remote-demo-baseline-%';/);
  assert.match(sql, /DELETE FROM watchlist\s+WHERE id LIKE 'remote-demo-watchlist-%';/);
  assert.match(sql, /INSERT OR REPLACE INTO provider_limits/);
  assert.match(sql, /ON CONFLICT\(provider\) DO UPDATE/);
  assert.equal(/DELETE FROM fare_checks/i.test(sql), false);
  assert.equal(/DELETE FROM deal_scores/i.test(sql), false);
  assert.equal(/DELETE FROM alerts/i.test(sql), false);
  assert.equal(/DELETE FROM route_candidates/i.test(sql), false);
  assert.equal(/DELETE FROM provider_limits/i.test(sql), false);
});

test("remote demo seed does not include raw provider payload fields", () => {
  const sql = readText(SEED_SQL_PATH);
  const verifySql = readText(VERIFY_SQL_PATH);

  assert.equal(/raw_payload|provider_payload|revalidation_payload|authorization|bearer/i.test(sql), false);
  assert.equal(/raw_payload|provider_payload|revalidation_payload|authorization|bearer/i.test(verifySql), false);
});

test("remote demo seed scripts are exposed in package.json", () => {
  const packageJson = JSON.parse(readText("package.json")) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts["cf:demo:seed:local"], "npx wrangler d1 execute malaysia-flight-deal-radar --local --file scripts/sql/remote-demo-baseline-seed.sql");
  assert.equal(packageJson.scripts["cf:demo:seed:remote"], "npx wrangler d1 execute malaysia-flight-deal-radar --remote --file scripts/sql/remote-demo-baseline-seed.sql");
  assert.equal(packageJson.scripts["cf:demo:cleanup:remote"], "npx wrangler d1 execute malaysia-flight-deal-radar --remote --file scripts/sql/remote-demo-cleanup.sql");
  assert.equal(packageJson.scripts["cf:demo:reset:remote"], "node scripts/cf-demo-reset-remote.mjs");
  assert.equal(packageJson.scripts["cf:demo:verify:remote"], "npx wrangler d1 execute malaysia-flight-deal-radar --remote --file scripts/sql/remote-demo-baseline-verify.sql");
});

test("remote demo cleanup SQL only targets mock/demo rows", () => {
  const sql = readText(CLEANUP_SQL_PATH);

  assert.match(sql, /DELETE FROM alerts[\s\S]*provider = 'mock'[\s\S]*provider_name = 'mock'/);
  assert.match(sql, /DELETE FROM deal_scores[\s\S]*fare_check_id IN[\s\S]*FROM fare_checks[\s\S]*WHERE provider = 'mock'/);
  assert.match(sql, /DELETE FROM fare_checks\s+WHERE provider = 'mock';/);
  assert.match(sql, /DELETE FROM fare_snapshots\s+WHERE provider = 'mock';/);
  assert.match(sql, /DELETE FROM search_jobs[\s\S]*provider = 'mock'[\s\S]*provider_name = 'mock'/);
  assert.match(sql, /DELETE FROM watchlist\s+WHERE id LIKE 'remote-demo-watchlist-%';/);
  assert.match(sql, /UPDATE provider_limits[\s\S]*WHERE provider = 'mock';/);
});

test("remote demo cleanup SQL never targets real provider rows or shared tables", () => {
  const sql = readText(CLEANUP_SQL_PATH);

  assert.equal(/duffel|amadeus|skyscanner/i.test(sql), false);
  assert.equal(/DELETE FROM provider_limits/i.test(sql), false);
  assert.equal(/DELETE FROM route_candidates/i.test(sql), false);
  assert.equal(/DELETE FROM airports/i.test(sql), false);
  assert.equal(/DELETE FROM settings/i.test(sql), false);
  assert.equal(/DELETE FROM watchlist\s*;|DELETE FROM watchlist\s+WHERE\s+active/i.test(sql), false);
});

test("remote demo verification query checks label counts, provider counts, latest revalidation, and baselines", () => {
  const sql = readText(VERIFY_SQL_PATH);

  assert.match(sql, /'strong_deal', 2/);
  assert.match(sql, /'suspected_deal', 2/);
  assert.match(sql, /'no_deal', 1/);
  assert.match(sql, /COUNT\(\*\) AS fare_check_count/);
  assert.match(sql, /MAX\(last_revalidated_at\) AS latest_revalidated_at/);
  assert.match(sql, /COUNT\(\*\) AS sample_count/);
  assert.match(sql, /id LIKE 'remote-demo-baseline-%'/);
});

test("remote demo reset flow docs include cleanup, seed, scan, and verify without secrets", () => {
  const docs = [
    readText("README.md"),
    readText("docs/cloudflare_deployment.md"),
    readText("docs/deployment_smoke_checklist.md"),
    readText("docs/local_demo.md")
  ].join("\n");
  const resetScript = readText("scripts/cf-demo-reset-remote.mjs");

  assert.match(docs, /cf:demo:cleanup:remote/);
  assert.match(docs, /cf:demo:seed:remote/);
  assert.match(docs, /cf:demo:verify:remote/);
  assert.match(docs, /api\/admin\/scan/);
  assert.match(docs, /strong_deal`: 2/);
  assert.match(docs, /suspected_deal`: 2/);
  assert.match(docs, /no_deal`: at least 1/);
  assert.match(resetScript, /Remote demo reset finished/);
  assert.match(resetScript, /remote-demo-cleanup\.sql/);
  assert.match(resetScript, /remote-demo-baseline-seed\.sql/);
  assert.match(resetScript, /remote-demo-baseline-verify\.sql/);
  assert.match(resetScript, /Read-Host "ADMIN_TOKEN"/);
  assert.equal(/duffel_live_|duffel_test_secret|telegram-secret|amadeus-secret|skyscanner-secret/i.test(docs), false);
  assert.equal(/duffel_live_|duffel_test_secret|telegram-secret|amadeus-secret|skyscanner-secret/i.test(resetScript), false);
});

test("seeded baselines produce dashboard/API-ready median and p10 deal labels", async () => {
  const sql = readText(SEED_SQL_PATH);
  const routes = parseRouteSeeds(sql);
  const sampleIndexes = parseSampleIndexes(sql);
  const provider = new MockProvider();
  const expectedLabels = new Map([
    ["SZB-NRT", "strong_deal"],
    ["KUL-BKK", "strong_deal"],
    ["KUL-TPE", "suspected_deal"],
    ["JHB-BKK", "suspected_deal"],
    ["KUL-SIN", "no_deal"]
  ]);

  for (const route of routes) {
    const [offer] = await provider.searchRoundTripOffers({
      originIata: route.origin,
      destinationIata: route.destination,
      departureDate: DEMO_DEPARTURE_DATE,
      returnDate: DEMO_RETURN_DATE,
      adults: 1
    });
    assert.ok(offer);

    const score = scoreDeal({
      offer: {
        ...offer,
        lastVerifiedAt: DEMO_NOW.toISOString(),
        display: {
          canAlert: true,
          canDisplay: true,
          requiresRevalidation: false
        }
      },
      historicalSamples: historicalSamplesFor(route, sampleIndexes),
      now: DEMO_NOW
    });

    assert.equal(score.sample_size, 20);
    assert.equal(score.baseline_median_minor_myr, route.medianAmountMinorMyr);
    assert.equal(score.historical_p10_minor_myr, route.lowAmountMinorMyr);
    assert.equal(score.deal_label, expectedLabels.get(routeKey(route)));
  }
});

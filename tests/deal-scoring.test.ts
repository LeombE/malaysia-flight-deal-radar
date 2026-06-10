import test from "node:test";
import assert from "node:assert/strict";
import { isDuplicateAlertWithinCooldown } from "../src/alerts/duplicate-alerts.ts";
import { MockProvider } from "../src/providers/mock-provider.ts";
import type { ProviderOffer } from "../src/providers/types.ts";
import { destinationAirportSeeds, originAirportSeeds } from "../src/seeds/airports.ts";
import { scoreDeal } from "../src/scoring/deal-scoring.ts";
import { median, p10, percentile } from "../src/scoring/statistics.ts";
import type { HistoricalFareSample, ScoreDealOptions } from "../src/scoring/types.ts";

const NOW = new Date("2026-06-10T08:00:00.000Z");

function samples(values: readonly number[]): HistoricalFareSample[] {
  return values.map((amountMinorMyr) => ({ amountMinorMyr }));
}

function baselineSamples(options: { lowP10Minor?: number; medianMinor?: number; count?: number } = {}): HistoricalFareSample[] {
  const lowP10Minor = options.lowP10Minor ?? 70_000;
  const medianMinor = options.medianMinor ?? 100_000;
  const count = options.count ?? 20;
  if (count < 2) return samples(Array.from({ length: count }, () => medianMinor));
  return samples([
    lowP10Minor,
    lowP10Minor,
    ...Array.from({ length: count - 2 }, () => medianMinor)
  ]);
}

async function baseOffer(overrides: Partial<ProviderOffer> = {}): Promise<ProviderOffer> {
  const provider = new MockProvider();
  const [offer] = await provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  });
  assert.ok(offer);
  return {
    ...offer,
    price: { amountMinor: 80_000, currency: "MYR" },
    lastVerifiedAt: "2026-06-10T07:45:00.000Z",
    display: {
      canAlert: true,
      canDisplay: true,
      requiresRevalidation: false
    },
    ...overrides
  };
}

async function score(overrides: Partial<ProviderOffer>, options: Partial<ScoreDealOptions> = {}) {
  return scoreDeal({
    offer: await baseOffer(overrides),
    historicalSamples: baselineSamples(),
    now: NOW,
    ...options
  });
}

test("statistics use sorted integer minor units", () => {
  assert.equal(median([100_000, 80_000, 120_000]), 100_000);
  assert.equal(median([100_000, 120_000]), 110_000);
  assert.equal(percentile([90_000, 100_000, 80_000, 70_000], 50), 80_000);
  assert.equal(p10([100_000, 70_000, 120_000, 90_000, 80_000]), 70_000);
});

test("no historical samples produce no_deal and no alert", async () => {
  const result = await score({}, { historicalSamples: [] });
  assert.equal(result.sample_size, 0);
  assert.equal(result.historical_median_myr, null);
  assert.equal(result.historical_p10_myr, null);
  assert.equal(result.deal_label, "no_deal");
  assert.equal(result.score, 0);
  assert.equal(result.alert_eligible, false);
  assert.ok(result.reasons.includes("no_historical_samples"));
});

test("sample size below 20 is no_deal unless watchlist route", async () => {
  const result = await score(
    { price: { amountMinor: 40_000, currency: "MYR" } },
    { historicalSamples: baselineSamples({ count: 19 }) }
  );
  assert.equal(result.sample_size, 19);
  assert.equal(result.deal_label, "no_deal");
  assert.equal(result.alert_eligible, false);
  assert.ok(result.reasons.includes("insufficient_historical_samples"));
});

test("exactly 20 percent below baseline is suspected_deal", async () => {
  const result = await score(
    { price: { amountMinor: 80_000, currency: "MYR" } },
    { historicalSamples: baselineSamples({ lowP10Minor: 70_000, medianMinor: 100_000 }) }
  );
  assert.equal(result.sample_size, 20);
  assert.equal(result.baseline_median_minor_myr, 100_000);
  assert.equal(result.historical_p10_minor_myr, 70_000);
  assert.equal(result.discount_pct, 20);
  assert.equal(result.deal_label, "suspected_deal");
  assert.equal(result.score, 70);
  assert.equal(result.alert_eligible, true);
});

test("30 percent below baseline is strong_deal", async () => {
  const result = await score(
    { price: { amountMinor: 70_000, currency: "MYR" } },
    { historicalSamples: baselineSamples({ lowP10Minor: 60_000, medianMinor: 100_000 }) }
  );
  assert.equal(result.discount_pct, 30);
  assert.equal(result.deal_label, "strong_deal");
  assert.ok(result.score >= 85);
  assert.equal(result.alert_eligible, true);
});

test("current price below historical p10 is strong_deal", async () => {
  const result = await score(
    { price: { amountMinor: 84_000, currency: "MYR" } },
    { historicalSamples: baselineSamples({ lowP10Minor: 85_000, medianMinor: 100_000 }) }
  );
  assert.equal(result.discount_pct, 16);
  assert.equal(result.historical_p10_minor_myr, 85_000);
  assert.equal(result.deal_label, "strong_deal");
  assert.ok(result.reasons.includes("current_price_at_or_below_p10"));
  assert.equal(result.alert_eligible, true);
});

test("stale revalidation becomes urgent_revalidate and cannot alert", async () => {
  const result = await score({
    price: { amountMinor: 70_000, currency: "MYR" },
    lastVerifiedAt: "2026-06-10T06:00:00.000Z"
  });
  assert.equal(result.deal_label, "urgent_revalidate");
  assert.equal(result.alert_eligible, false);
  assert.ok(result.score < 70);
  assert.ok(result.reasons.includes("last_verified_too_old"));
  assert.ok(result.reasons.includes("stale_verification"));
});

test("expired offer becomes expired and cannot alert", async () => {
  const result = await score({
    price: { amountMinor: 70_000, currency: "MYR" },
    expiresAt: "2026-06-10T07:59:59.000Z"
  });
  assert.equal(result.deal_label, "expired");
  assert.equal(result.score, 0);
  assert.equal(result.alert_eligible, false);
  assert.ok(result.reasons.includes("offer_expired"));
});

test("very long itinerary receives quality penalty", async () => {
  const normal = await score({ price: { amountMinor: 70_000, currency: "MYR" } });
  const long = await score({
    price: { amountMinor: 70_000, currency: "MYR" },
    durationMinutes: 1_000
  });
  assert.equal(long.deal_label, "strong_deal");
  assert.ok(long.score < normal.score);
  assert.ok(long.quality_penalty >= 15);
  assert.ok(long.reasons.includes("very_long_total_duration"));
});

test("too many stops receive quality penalty", async () => {
  const result = await score({
    price: { amountMinor: 70_000, currency: "MYR" },
    totalStops: 4
  }, { maxStops: 2 });
  assert.equal(result.deal_label, "strong_deal");
  assert.ok(result.score < 85);
  assert.ok(result.reasons.includes("too_many_stops"));
});

test("duplicate alert prevention uses route, dates, provider, and label within cooldown", () => {
  const input = {
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06",
    provider: "mock",
    dealLabel: "strong_deal" as const
  };

  const duplicate = isDuplicateAlertWithinCooldown(input, [
    {
      ...input,
      sentAt: "2026-06-10T07:00:00.000Z"
    }
  ], {
    now: NOW,
    cooldownMinutes: 180
  });

  assert.equal(duplicate.isDuplicate, true);
  assert.equal(duplicate.dedupeKey, "KUL|BKK|2026-10-01|2026-10-06|mock|strong_deal");
  assert.equal(duplicate.cooldownUntil, "2026-06-10T10:00:00.000Z");

  const outsideCooldown = isDuplicateAlertWithinCooldown(input, [
    {
      ...input,
      sentAt: "2026-06-10T01:00:00.000Z"
    }
  ], {
    now: NOW,
    cooldownMinutes: 180
  });
  assert.equal(outsideCooldown.isDuplicate, false);

  const differentLabel = isDuplicateAlertWithinCooldown(input, [
    {
      ...input,
      dealLabel: "suspected_deal",
      sentAt: "2026-06-10T07:00:00.000Z"
    }
  ], {
    now: NOW,
    cooldownMinutes: 180
  });
  assert.equal(differentLabel.isDuplicate, false);
});

test("watchlist route with insufficient history is watched_price", async () => {
  const result = await score(
    { price: { amountMinor: 40_000, currency: "MYR" } },
    {
      historicalSamples: baselineSamples({ count: 5 }),
      isWatchlistRoute: true
    }
  );
  assert.equal(result.sample_size, 5);
  assert.equal(result.deal_label, "watched_price");
  assert.equal(result.alert_eligible, false);
});

test("airport seeds include required origins and destinations with active flags", () => {
  assert.deepEqual(originAirportSeeds.map((airport) => airport.iata_code), ["JHB", "KUL", "SZB"]);
  const destinationCodes = new Set(destinationAirportSeeds.map((airport) => airport.iata_code));
  for (const code of ["SIN", "BKK", "DMK", "HKT", "SGN", "HAN", "DPS", "CGK", "MNL", "CEB", "TPE", "NRT", "HND", "KIX", "FUK", "ICN", "PUS", "PVG", "PEK", "CAN", "SZX", "XMN", "HGH", "CTU"]) {
    assert.equal(destinationCodes.has(code), true, `${code} seed missing`);
  }
  assert.equal(destinationAirportSeeds.every((airport) => airport.active), true);
});


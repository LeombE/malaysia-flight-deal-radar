import { discountPercentage, formatMyrFromMinor, median, p10, validMinorUnitSamples } from "./statistics.ts";
import type { DealLabel, DealScoreResult, ScoreDealOptions } from "./types.ts";

const DEFAULT_FRESH_WITHIN_MINUTES = 30;
const DEFAULT_MAX_STOPS = 2;

function minutesBetween(later: Date, earlierIso: string): number {
  const earlier = Date.parse(earlierIso);
  if (!Number.isFinite(earlier)) return Number.POSITIVE_INFINITY;
  return (later.getTime() - earlier) / 60_000;
}

function isExpired(expiresAt: string | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime();
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)));
}

function calculateQualityPenalty(options: ScoreDealOptions, now: Date, isStale: boolean): { penalty: number; reasons: string[] } {
  const reasons: string[] = [];
  let penalty = 0;
  const maxStops = options.maxStops ?? DEFAULT_MAX_STOPS;
  const offer = options.offer;

  if (offer.totalStops > maxStops) {
    const stopPenalty = Math.min(30, (offer.totalStops - maxStops) * 10);
    penalty += stopPenalty;
    reasons.push("too_many_stops");
  }

  if (offer.durationMinutes > 900) {
    penalty += 15;
    reasons.push("very_long_total_duration");
  } else if (offer.durationMinutes > 720) {
    penalty += 8;
    reasons.push("long_total_duration");
  }

  if (options.selfTransfer) {
    penalty += 15;
    reasons.push("self_transfer");
  }

  if (isStale) {
    penalty += 25;
    reasons.push("stale_verification");
  }

  if (offer.carriers.length === 0) {
    penalty += 10;
    reasons.push("missing_carrier_data");
  }

  if (offer.price.currency !== "MYR") {
    penalty += 100;
    reasons.push("unsupported_currency");
  }

  void now;
  return { penalty, reasons };
}

function baseScoreFor(label: DealLabel, discountPct: number, currentPriceMinor: number, historicalP10Minor: number | null): number {
  if (label === "strong_deal") {
    const p10Boost = historicalP10Minor !== null && currentPriceMinor <= historicalP10Minor ? 5 : 0;
    return 85 + Math.min(10, Math.max(0, discountPct - 30)) + p10Boost;
  }
  if (label === "suspected_deal") {
    return 70 + Math.min(10, Math.max(0, discountPct - 20));
  }
  if (label === "watched_price") {
    return 25;
  }
  return 0;
}

export function scoreDeal(options: ScoreDealOptions): DealScoreResult {
  const now = options.now ?? new Date();
  const offer = options.offer;
  const freshWithinMinutes = options.freshWithinMinutes ?? DEFAULT_FRESH_WITHIN_MINUTES;
  const samples = validMinorUnitSamples(options.historicalSamples.map((sample) => sample.amountMinorMyr));
  const sampleSize = samples.length;
  const historicalMedian = median(samples);
  const historicalP10 = p10(samples);
  const discountPct = discountPercentage(offer.price.amountMinor, historicalMedian);
  const staleByAge = minutesBetween(now, offer.lastVerifiedAt) > freshWithinMinutes;
  const staleByPolicy = offer.display.requiresRevalidation || !offer.display.canAlert;
  const stale = staleByAge || staleByPolicy;
  const expired = isExpired(offer.expiresAt, now);
  const reasons: string[] = [];

  let label: DealLabel = "no_deal";
  if (sampleSize < 20) {
    label = options.isWatchlistRoute ? "watched_price" : "no_deal";
    reasons.push(sampleSize === 0 ? "no_historical_samples" : "insufficient_historical_samples");
  } else if (historicalP10 !== null && offer.price.amountMinor <= historicalP10) {
    label = "strong_deal";
    reasons.push("current_price_at_or_below_p10");
  } else if (discountPct >= 30) {
    label = "strong_deal";
    reasons.push("discount_at_least_30_pct");
  } else if (discountPct >= 20) {
    label = "suspected_deal";
    reasons.push("discount_at_least_20_pct");
  } else {
    label = "no_deal";
    reasons.push("below_deal_threshold");
  }

  const underlyingDealLabel = label;
  if (expired) {
    label = "expired";
    reasons.push("offer_expired");
  } else if (stale) {
    label = "urgent_revalidate";
    reasons.push(staleByAge ? "last_verified_too_old" : "provider_requires_revalidation");
  }

  const quality = calculateQualityPenalty(options, now, stale);
  reasons.push(...quality.reasons);

  const baseScore = baseScoreFor(underlyingDealLabel, discountPct, offer.price.amountMinor, historicalP10);
  const uncappedScore = clampScore(baseScore - quality.penalty);
  const score = label === "expired" ? 0 : label === "urgent_revalidate" ? Math.min(65, uncappedScore) : uncappedScore;
  const alertEligible =
    score >= 70 &&
    !stale &&
    !expired &&
    offer.display.canAlert &&
    !offer.display.requiresRevalidation &&
    (label === "suspected_deal" || label === "strong_deal");

  return {
    current_price_myr: formatMyrFromMinor(offer.price.amountMinor) ?? "0.00",
    historical_median_myr: formatMyrFromMinor(historicalMedian),
    historical_p10_myr: formatMyrFromMinor(historicalP10),
    amount_minor_myr: offer.price.amountMinor,
    baseline_median_minor_myr: historicalMedian,
    historical_p10_minor_myr: historicalP10,
    sample_size: sampleSize,
    discount_pct: discountPct,
    score,
    deal_label: label,
    alert_eligible: alertEligible,
    reasons: [...new Set(reasons)],
    quality_penalty: quality.penalty
  };
}

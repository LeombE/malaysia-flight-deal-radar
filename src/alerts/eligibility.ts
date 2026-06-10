import { buildAlertDedupeKey, isDuplicateAlertWithinCooldown } from "./duplicate-alerts.ts";
import type { AlertEligibilityResult, AlertEvaluationInput } from "./types.ts";

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

function missingEssentialFields(input: AlertEvaluationInput): string[] {
  const offer = input.offer;
  const missing: string[] = [];
  if (!offer.originIata) missing.push("missing_origin");
  if (!offer.destinationIata) missing.push("missing_destination");
  if (!offer.departureDate) missing.push("missing_departure_date");
  if (!offer.returnDate) missing.push("missing_return_date");
  if (!Number.isInteger(offer.price.amountMinor) || offer.price.amountMinor <= 0) missing.push("missing_price");
  if (offer.price.currency !== "MYR") missing.push("price_not_myr");
  if (offer.carriers.length === 0) missing.push("missing_carrier");
  if (offer.durationMinutes <= 0) missing.push("missing_duration");
  return missing;
}

export function evaluateAlertEligibility(input: AlertEvaluationInput): AlertEligibilityResult {
  const dedupeKey = buildAlertDedupeKey({
    originIata: input.offer.originIata,
    destinationIata: input.offer.destinationIata,
    departureDate: input.offer.departureDate,
    returnDate: input.offer.returnDate,
    provider: input.offer.provider,
    dealLabel: input.score.deal_label
  });
  const reasons: string[] = [];

  if (input.score.score < 70) reasons.push("score_below_70");
  if (input.score.deal_label !== "suspected_deal" && input.score.deal_label !== "strong_deal") {
    reasons.push(`label_not_alertable:${input.score.deal_label}`);
  }
  if (!input.recentlyRevalidated) reasons.push("not_recently_revalidated");
  if (input.offer.display.requiresRevalidation || !input.offer.display.canAlert || !input.offer.display.canDisplay) {
    reasons.push("provider_display_not_allowed");
  }
  if (isExpired(input.offer.expiresAt, input.now)) reasons.push("offer_expired");
  if (minutesBetween(input.now, input.offer.lastVerifiedAt) > input.revalidateBeforeAlertMinutes) reasons.push("stale_revalidation");
  reasons.push(...missingEssentialFields(input));

  const duplicate = isDuplicateAlertWithinCooldown({
    originIata: input.offer.originIata,
    destinationIata: input.offer.destinationIata,
    departureDate: input.offer.departureDate,
    returnDate: input.offer.returnDate,
    provider: input.offer.provider,
    dealLabel: input.score.deal_label
  }, input.previousAlerts, {
    now: input.now,
    cooldownMinutes: input.cooldownHours * 60
  });

  if (duplicate.isDuplicate) {
    const duplicateResult: AlertEligibilityResult = {
      eligible: false,
      status: "duplicate",
      dedupeKey,
      reasons: ["duplicate_within_cooldown"]
    };
    if (duplicate.cooldownUntil) {
      duplicateResult.cooldownUntil = duplicate.cooldownUntil;
    }
    return duplicateResult;
  }

  return {
    eligible: reasons.length === 0,
    status: reasons.length === 0 ? "skipped" : "skipped",
    dedupeKey,
    reasons
  };
}

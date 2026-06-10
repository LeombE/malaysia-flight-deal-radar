import type { ProviderOffer } from "../providers/types.ts";
import { formatMyrFromMinor } from "../scoring/statistics.ts";
import type { AlertMessageInput } from "./types.ts";

const MARKDOWN_V2_SPECIALS = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeTelegramMarkdown(value: string): string {
  return value.replace(MARKDOWN_V2_SPECIALS, (character) => `\\${character}`);
}

function formatStops(stops: number): string {
  return stops === 0 ? "nonstop" : `${stops} stop${stops === 1 ? "" : "s"}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

function titleFor(label: string): string {
  return label === "strong_deal" ? "Strong flight deal found" : "Suspected flight deal found";
}

export function canIncludeDeepLink(offer: ProviderOffer, deepLink: string | undefined): boolean {
  return Boolean(deepLink && offer.display.canDisplay && offer.display.canAlert && !offer.display.requiresRevalidation);
}

export function formatTelegramDealMessage(input: AlertMessageInput): string {
  const offer = input.offer;
  const score = input.score;
  const lines = [
    `*${escapeTelegramMarkdown(titleFor(score.deal_label))}*`,
    `${escapeTelegramMarkdown(offer.originIata)} → ${escapeTelegramMarkdown(offer.destinationIata)}`,
    `Depart: ${escapeTelegramMarkdown(offer.departureDate)}`,
    `Return: ${escapeTelegramMarkdown(offer.returnDate)}`,
    `Stay: ${input.stayLengthDays} days`,
    `Price: RM${escapeTelegramMarkdown(formatMyrFromMinor(score.amount_minor_myr) ?? "0.00")}`,
    `Median: ${score.baseline_median_minor_myr === null ? "n/a" : `RM${escapeTelegramMarkdown(formatMyrFromMinor(score.baseline_median_minor_myr) ?? "0.00")}`}`,
    `P10: ${score.historical_p10_minor_myr === null ? "n/a" : `RM${escapeTelegramMarkdown(formatMyrFromMinor(score.historical_p10_minor_myr) ?? "0.00")}`}`,
    `Discount: ${escapeTelegramMarkdown(`${score.discount_pct}%`)}`,
    `Score: ${score.score}`,
    `Label: ${escapeTelegramMarkdown(score.deal_label)}`,
    `Carrier: ${escapeTelegramMarkdown(offer.carriers.join(", ") || "unknown")}`,
    `Stops: ${escapeTelegramMarkdown(formatStops(offer.totalStops))}`,
    `Duration: ${escapeTelegramMarkdown(formatDuration(offer.durationMinutes))}`,
    `Provider: ${escapeTelegramMarkdown(offer.provider)}`,
    `Last verified: ${escapeTelegramMarkdown(offer.lastVerifiedAt)}`
  ];

  if (offer.expiresAt) {
    lines.push(`Expires: ${escapeTelegramMarkdown(offer.expiresAt)}`);
  }
  if (canIncludeDeepLink(offer, input.deepLink ?? offer.deepLink)) {
    lines.push(`Link: ${escapeTelegramMarkdown((input.deepLink ?? offer.deepLink) as string)}`);
  }
  lines.push(escapeTelegramMarkdown("Warning: price can change before purchase. Verify manually before booking."));
  return lines.join("\n");
}

export function hashAlertMessage(message: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < message.length; index += 1) {
    hash ^= message.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

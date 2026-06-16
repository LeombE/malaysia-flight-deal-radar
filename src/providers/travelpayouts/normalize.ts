import type { TravelpayoutsConfig } from "../../config/travelpayouts.ts";
import { destinationAirportSeeds } from "../../seeds/airports.ts";
import type { PriceCalendarApiRecord } from "../../routes/api-types.ts";
import type { PriceCalendarSearchInput } from "../cached-types.ts";
import type { TravelpayoutsEndpoint } from "./request-builder.ts";
import type { TravelpayoutsPriceRow } from "./schemas.ts";

const WARNING = "Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.";

const destinationMeta = new Map(destinationAirportSeeds.map((seed) => [seed.iata_code, seed]));

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function iata(value: unknown): string | null {
  const text = stringValue(value)?.toUpperCase();
  return text && /^[A-Z0-9]{3}$/.test(text) ? text : null;
}

function carrierCode(value: unknown): string | null {
  const text = stringValue(value)?.toUpperCase();
  return text && /^[A-Z0-9]{2,3}$/.test(text) ? text : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

function dateOnly(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const direct = /^\d{4}-\d{2}-\d{2}$/.exec(text);
  if (direct) return text;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function stayLengthDays(departureDate: string, returnDate: string): number {
  return Math.round((Date.parse(`${returnDate}T00:00:00.000Z`) - Date.parse(`${departureDate}T00:00:00.000Z`)) / 86_400_000);
}

function freshness(foundAt: string, expiresAt: string | null, nowMs: number): PriceCalendarApiRecord["freshness_label"] {
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) return "expired";
  const foundMs = Date.parse(foundAt);
  if (!Number.isFinite(foundMs)) return "cached";
  const ageHours = (nowMs - foundMs) / 3_600_000;
  if (ageHours <= 6) return "fresh";
  if (ageHours <= 48) return "recent";
  return "cached";
}

function searchLink(row: TravelpayoutsPriceRow, origin: string, destination: string, departureDate: string, returnDate: string): string {
  const link = stringValue(row.link);
  if (link?.startsWith("https://")) return link;
  return `https://www.aviasales.com/search/${origin}${departureDate.replaceAll("-", "").slice(2)}${destination}${returnDate.replaceAll("-", "").slice(2)}1`;
}

export function normalizeTravelpayoutsRows(input: {
  rows: readonly TravelpayoutsPriceRow[];
  search: PriceCalendarSearchInput;
  config: TravelpayoutsConfig;
  endpoint: TravelpayoutsEndpoint;
  retrievedAtIso: string;
  nowMs: number;
}): PriceCalendarApiRecord[] {
  const output: PriceCalendarApiRecord[] = [];
  for (const row of input.rows) {
    const origin = iata(row.origin) ?? input.search.originIata;
    const destination = iata(row.destination) ?? input.search.destinationIata;
    const destinationSeed = destinationMeta.get(destination);
    if (!destinationSeed) continue;

    const departureDate = dateOnly(row.depart_date) ?? dateOnly(row.departure_at);
    const returnDate = dateOnly(row.return_date) ?? dateOnly(row.return_at);
    if (!departureDate || !returnDate) continue;

    const amount = numberValue(row.value) ?? numberValue(row.price);
    if (amount === null || amount <= 0) continue;

    const originalCurrency = input.config.currency;
    const amountMinorMyr = originalCurrency === "MYR" ? Math.round(amount * 100) : null;
    if (originalCurrency === "MYR" && (amountMinorMyr === null || amountMinorMyr <= 0)) continue;

    const retrievedAt = stringValue(row.found_at) ?? input.retrievedAtIso;
    const expiresAt = stringValue(row.expires_at);
    const stops = integerValue(row.number_of_changes) ?? integerValue(row.transfers);
    const flightNumber = row.flight_number === undefined ? null : String(row.flight_number);
    output.push({
      origin_iata: origin,
      destination_iata: destination,
      destination_country: destinationSeed.country_code,
      destination_region: destinationSeed.region_group,
      departure_date: departureDate,
      return_date: returnDate,
      stay_length_days: input.search.stayLengthDays ?? stayLengthDays(departureDate, returnDate),
      trip_type: "round_trip",
      cabin_class: "economy",
      adults: Math.max(1, input.search.adults ?? 1),
      amount_minor_myr: amountMinorMyr,
      display_price_rm: amountMinorMyr === null ? "Unavailable" : `RM${(amountMinorMyr / 100).toFixed(2)}`,
      original_amount: amount,
      original_currency: originalCurrency,
      airline_iata: carrierCode(row.airline),
      flight_number: flightNumber,
      stops,
      total_duration_minutes: null,
      provider_name: "travelpayouts",
      source_endpoint: input.endpoint,
      retrieved_at: retrievedAt,
      expires_at: expiresAt,
      freshness_label: freshness(retrievedAt, expiresAt, input.nowMs),
      is_live: false,
      is_bookable_claim: false,
      search_link: searchLink(row, origin, destination, departureDate, returnDate),
      warning: WARNING,
      deal_label: null,
      deal_score: null
    });
  }
  return output;
}

import type { TravelpayoutsConfig } from "../../config/travelpayouts.ts";
import type { PriceCalendarSearchInput } from "../cached-types.ts";

export type TravelpayoutsEndpoint =
  | "v2/prices/latest"
  | "v2/prices/month-matrix"
  | "v2/prices/week-matrix"
  | "aviasales/v3/prices_for_dates";

function baseUrl(config: TravelpayoutsConfig, endpoint: TravelpayoutsEndpoint): URL {
  return new URL(`/${endpoint}`, config.apiBaseUrl);
}

function clampLimit(value: number | undefined, fallback = 30, max = 1000): number {
  return Math.max(1, Math.min(value ?? fallback, max));
}

function monthStart(value: string | undefined): string {
  const raw = value && /^\d{4}-\d{2}(?:-\d{2})?$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 10);
  return `${raw.slice(0, 7)}-01`;
}

function appendRouteParams(url: URL, config: TravelpayoutsConfig, input: PriceCalendarSearchInput): void {
  url.searchParams.set("origin", input.originIata);
  url.searchParams.set("destination", input.destinationIata);
  url.searchParams.set("currency", config.currency);
  url.searchParams.set("show_to_affiliates", "true");
}

export function buildLatestUrl(config: TravelpayoutsConfig, input: PriceCalendarSearchInput): string {
  const url = baseUrl(config, "v2/prices/latest");
  appendRouteParams(url, config, input);
  url.searchParams.set("period_type", input.periodType ?? "month");
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", String(clampLimit(input.limit)));
  url.searchParams.set("sorting", "price");
  url.searchParams.set("trip_class", "0");
  url.searchParams.set("one_way", "false");
  if (input.stayLengthDays !== undefined) url.searchParams.set("trip_duration", String(input.stayLengthDays));
  url.searchParams.set("beginning_of_period", monthStart(input.departureFrom));
  return url.toString();
}

export function buildMonthMatrixUrl(config: TravelpayoutsConfig, input: PriceCalendarSearchInput): string {
  const url = baseUrl(config, "v2/prices/month-matrix");
  appendRouteParams(url, config, input);
  url.searchParams.set("month", monthStart(input.departureFrom));
  return url.toString();
}

export function buildWeekMatrixUrl(config: TravelpayoutsConfig, input: PriceCalendarSearchInput): string {
  const url = baseUrl(config, "v2/prices/week-matrix");
  appendRouteParams(url, config, input);
  if (input.departureFrom) url.searchParams.set("depart_date", input.departureFrom);
  if (input.returnFrom) url.searchParams.set("return_date", input.returnFrom);
  return url.toString();
}

export function buildV3PricesForDatesUrl(config: TravelpayoutsConfig, input: PriceCalendarSearchInput): string {
  const url = baseUrl(config, "aviasales/v3/prices_for_dates");
  url.searchParams.set("origin", input.originIata);
  url.searchParams.set("destination", input.destinationIata);
  url.searchParams.set("currency", config.currency);
  url.searchParams.set("departure_at", input.departureFrom ?? monthStart(undefined).slice(0, 7));
  if (input.returnFrom) url.searchParams.set("return_at", input.returnFrom);
  url.searchParams.set("sorting", "price");
  url.searchParams.set("direct", "false");
  url.searchParams.set("one_way", input.returnFrom ? "false" : "true");
  url.searchParams.set("limit", String(clampLimit(input.limit, 10, 100)));
  url.searchParams.set("page", "1");
  return url.toString();
}

export function buildTravelpayoutsUrl(
  config: TravelpayoutsConfig,
  endpoint: TravelpayoutsEndpoint,
  input: PriceCalendarSearchInput
): string {
  if (endpoint === "v2/prices/latest") return buildLatestUrl(config, input);
  if (endpoint === "v2/prices/month-matrix") return buildMonthMatrixUrl(config, input);
  if (endpoint === "v2/prices/week-matrix") return buildWeekMatrixUrl(config, input);
  return buildV3PricesForDatesUrl(config, input);
}

export function safeQueryKeysForUrl(url: string): string[] {
  return [...new URL(url).searchParams.keys()].sort();
}

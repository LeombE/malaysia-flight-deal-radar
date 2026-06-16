import type { TravelpayoutsConfig } from "../../config/travelpayouts.ts";
import type { PriceCalendarSearchInput } from "../cached-types.ts";

export type TravelpayoutsEndpoint = "v2/prices/latest" | "v2/prices/month-matrix" | "v2/prices/week-matrix";

function baseUrl(config: TravelpayoutsConfig, endpoint: TravelpayoutsEndpoint): URL {
  return new URL(`/${endpoint}`, config.apiBaseUrl);
}

function appendCommonParams(url: URL, config: TravelpayoutsConfig, input: PriceCalendarSearchInput): void {
  url.searchParams.set("origin", input.originIata);
  url.searchParams.set("destination", input.destinationIata);
  url.searchParams.set("currency", config.currency);
  url.searchParams.set("show_to_affiliates", "true");
  url.searchParams.set("trip_class", "0");
  url.searchParams.set("one_way", "false");
  url.searchParams.set("limit", String(Math.max(1, Math.min(input.limit ?? 100, 1000))));
  if (input.stayLengthDays !== undefined) {
    url.searchParams.set("trip_duration", String(input.stayLengthDays));
    url.searchParams.set("length", String(input.stayLengthDays));
  }
}

export function buildLatestUrl(config: TravelpayoutsConfig, input: PriceCalendarSearchInput): string {
  const url = baseUrl(config, "v2/prices/latest");
  appendCommonParams(url, config, input);
  url.searchParams.set("period_type", "month");
  url.searchParams.set("sorting", "price");
  if (input.departureFrom) url.searchParams.set("beginning_of_period", input.departureFrom);
  return url.toString();
}

export function buildMonthMatrixUrl(config: TravelpayoutsConfig, input: PriceCalendarSearchInput): string {
  const url = baseUrl(config, "v2/prices/month-matrix");
  appendCommonParams(url, config, input);
  const month = (input.departureFrom ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
  url.searchParams.set("month", month);
  url.searchParams.set("beginning_of_period", `${month}-01`);
  return url.toString();
}

export function buildWeekMatrixUrl(config: TravelpayoutsConfig, input: PriceCalendarSearchInput): string {
  const url = baseUrl(config, "v2/prices/week-matrix");
  appendCommonParams(url, config, input);
  if (input.departureFrom) url.searchParams.set("depart_date", input.departureFrom);
  if (input.departureTo) url.searchParams.set("return_date", input.departureTo);
  return url.toString();
}

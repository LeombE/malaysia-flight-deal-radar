import type { PriceCalendarApiRecord } from "../routes/api-types.ts";
import type { ProviderHealth, ProviderRetentionMode } from "./types.ts";

export interface PriceCalendarSearchInput {
  originIata: string;
  destinationIata: string;
  departureFrom?: string;
  departureTo?: string;
  returnFrom?: string;
  returnTo?: string;
  stayLengthDays?: number;
  adults?: number;
  cabinClass?: "economy";
  limit?: number;
  periodType?: "year" | "month";
}

export interface CachedFareProvider {
  readonly name: string;
  readonly cachedDataSource: true;
  readonly liveGuarantee: false;
  isEnabled(): boolean;
  searchLatest(input: PriceCalendarSearchInput): Promise<PriceCalendarApiRecord[]>;
  searchMonthMatrix(input: PriceCalendarSearchInput): Promise<PriceCalendarApiRecord[]>;
  searchWeekMatrix(input: PriceCalendarSearchInput): Promise<PriceCalendarApiRecord[]>;
  getProviderHealth(): Promise<ProviderHealth>;
  getRetentionMode(): ProviderRetentionMode;
}

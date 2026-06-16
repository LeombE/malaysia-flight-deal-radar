import { TravelpayoutsProviderError } from "./errors.ts";

export interface TravelpayoutsPriceRow {
  origin?: unknown;
  destination?: unknown;
  depart_date?: unknown;
  return_date?: unknown;
  departure_at?: unknown;
  return_at?: unknown;
  number_of_changes?: unknown;
  transfers?: unknown;
  value?: unknown;
  price?: unknown;
  airline?: unknown;
  flight_number?: unknown;
  found_at?: unknown;
  expires_at?: unknown;
  actual?: unknown;
  link?: unknown;
  [key: string]: unknown;
}

export interface TravelpayoutsResponse {
  success: boolean;
  data: TravelpayoutsPriceRow[];
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenRows(value: unknown): TravelpayoutsPriceRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord) as TravelpayoutsPriceRow[];
  }
  if (!isRecord(value)) return [];
  const rows: TravelpayoutsPriceRow[] = [];
  for (const entry of Object.values(value)) {
    if (isRecord(entry)) rows.push(entry as TravelpayoutsPriceRow);
    if (Array.isArray(entry)) rows.push(...entry.filter(isRecord) as TravelpayoutsPriceRow[]);
  }
  return rows;
}

export function parseTravelpayoutsResponse(value: unknown): TravelpayoutsResponse {
  if (!isRecord(value)) throw new TravelpayoutsProviderError("Invalid Travelpayouts response");
  if (value.success !== true) {
    throw new TravelpayoutsProviderError("Travelpayouts API error");
  }
  return {
    success: true,
    data: flattenRows(value.data),
    error: null
  };
}

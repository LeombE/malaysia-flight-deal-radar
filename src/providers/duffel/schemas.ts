import { DuffelProviderError } from "./errors.ts";

export interface DuffelPlace {
  iata_code?: string;
  name?: string;
  [key: string]: unknown;
}

export interface DuffelCarrier {
  iata_code?: string;
  name?: string;
  [key: string]: unknown;
}

export interface DuffelPassengerSegment {
  cabin_class?: string;
  [key: string]: unknown;
}

export interface DuffelSegment {
  id?: string;
  origin?: DuffelPlace | string;
  destination?: DuffelPlace | string;
  departing_at?: string;
  arriving_at?: string;
  duration?: string;
  marketing_carrier?: DuffelCarrier;
  operating_carrier?: DuffelCarrier;
  marketing_carrier_flight_number?: string;
  passengers?: DuffelPassengerSegment[];
  stops?: unknown[];
  [key: string]: unknown;
}

export interface DuffelSlice {
  id?: string;
  origin?: DuffelPlace | string;
  destination?: DuffelPlace | string;
  departure_date?: string;
  duration?: string;
  segments?: DuffelSegment[];
  [key: string]: unknown;
}

export interface DuffelOffer {
  id?: string;
  total_amount?: string;
  total_currency?: string;
  expires_at?: string;
  live_mode?: boolean;
  slices?: DuffelSlice[];
  deep_link?: string;
  public_url?: string;
  [key: string]: unknown;
}

export interface DuffelOfferRequestResponse {
  data: {
    offers: DuffelOffer[];
  };
}

export interface DuffelOfferResponse {
  data: DuffelOffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new DuffelProviderError(`Invalid Duffel ${context} response`);
  }
  return value;
}

export function parseOfferRequestResponse(value: unknown): DuffelOfferRequestResponse {
  const root = assertRecord(value, "Offer Request");
  const data = assertRecord(root.data, "Offer Request data");
  if (!Array.isArray(data.offers)) {
    throw new DuffelProviderError("Invalid Duffel Offer Request response");
  }
  return {
    data: {
      offers: data.offers as DuffelOffer[]
    }
  };
}

export function parseOfferResponse(value: unknown): DuffelOfferResponse {
  const root = assertRecord(value, "Offer");
  const data = assertRecord(root.data, "Offer data");
  return {
    data: data as DuffelOffer
  };
}

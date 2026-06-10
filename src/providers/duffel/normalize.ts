import type { DuffelConfig } from "../../config/duffel.ts";
import type {
  ProviderItinerary,
  ProviderOffer,
  ProviderSegment,
  SearchRoundTripInput
} from "../types.ts";
import type { DuffelOffer, DuffelSegment, DuffelSlice } from "./schemas.ts";

export function parseDecimalMinorUnits(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const minor = `${fraction}00`.slice(0, 2);
  return Number.parseInt(whole, 10) * 100 + Number.parseInt(minor, 10);
}

export function parseIsoDurationMinutes(value: string | undefined): number {
  if (!value) return 0;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value);
  if (!match) return 0;
  const days = Number.parseInt(match[1] ?? "0", 10);
  const hours = Number.parseInt(match[2] ?? "0", 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  return days * 1_440 + hours * 60 + minutes;
}

function minutesBetween(startIso: string | undefined, endIso: string | undefined): number {
  if (!startIso || !endIso) return 0;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

function iataCode(value: unknown): string | null {
  if (typeof value === "string" && value.length === 3) return value;
  if (typeof value === "object" && value !== null && "iata_code" in value) {
    const code = (value as { iata_code?: unknown }).iata_code;
    return typeof code === "string" && code.length === 3 ? code : null;
  }
  return null;
}

function cabinIsEconomy(segment: DuffelSegment): boolean {
  if (!Array.isArray(segment.passengers) || segment.passengers.length === 0) return true;
  return segment.passengers.every((passenger) => {
    const cabinClass = passenger.cabin_class;
    return cabinClass === undefined || cabinClass === "economy";
  });
}

function normalizeSegment(segment: DuffelSegment): ProviderSegment | null {
  if (!cabinIsEconomy(segment)) return null;

  const originIata = iataCode(segment.origin);
  const destinationIata = iataCode(segment.destination);
  if (!originIata || !destinationIata) return null;

  const durationMinutes =
    parseIsoDurationMinutes(segment.duration) ||
    minutesBetween(segment.departing_at, segment.arriving_at);

  const normalized: ProviderSegment = {
    originIata,
    destinationIata,
    durationMinutes,
    technicalStops: Array.isArray(segment.stops) ? segment.stops.length : 0
  };

  if (segment.departing_at) normalized.departureAt = segment.departing_at;
  if (segment.arriving_at) normalized.arrivalAt = segment.arriving_at;
  if (segment.marketing_carrier?.iata_code) normalized.carrierCode = segment.marketing_carrier.iata_code;
  if (segment.operating_carrier?.iata_code) normalized.operatingCarrierCode = segment.operating_carrier.iata_code;
  if (segment.marketing_carrier_flight_number) normalized.flightNumber = segment.marketing_carrier_flight_number;
  return normalized;
}

function normalizeSlice(slice: DuffelSlice): ProviderItinerary | null {
  const segments = (slice.segments ?? [])
    .map((segment) => normalizeSegment(segment))
    .filter((segment): segment is ProviderSegment => segment !== null);

  if (segments.length === 0) return null;

  const connectionStops = Math.max(0, segments.length - 1);
  const technicalStops = segments.reduce((sum, segment) => sum + segment.technicalStops, 0);
  const durationMinutes =
    parseIsoDurationMinutes(slice.duration) ||
    segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);

  return {
    durationMinutes,
    stops: connectionStops + technicalStops,
    segments
  };
}

function sliceEndpoint(slice: DuffelSlice, side: "origin" | "destination"): string | null {
  const direct = iataCode(slice[side]);
  if (direct) return direct;
  const segments = slice.segments ?? [];
  if (segments.length === 0) return null;
  if (side === "origin") return iataCode(segments[0]?.origin);
  return iataCode(segments.at(-1)?.destination);
}

function isRoundTripForInput(slices: DuffelSlice[], input: SearchRoundTripInput): boolean {
  if (slices.length !== 2) return false;
  const [outbound, inbound] = slices;
  if (!outbound || !inbound) return false;
  return (
    sliceEndpoint(outbound, "origin") === input.originIata &&
    sliceEndpoint(outbound, "destination") === input.destinationIata &&
    sliceEndpoint(inbound, "origin") === input.destinationIata &&
    sliceEndpoint(inbound, "destination") === input.originIata
  );
}

function isExpired(expiresAt: string | undefined, nowMs: number): boolean {
  if (!expiresAt) return false;
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires <= nowMs;
}

function displayPolicy(displayIsRevalidated: boolean): ProviderOffer["display"] {
  if (displayIsRevalidated) {
    return {
      canAlert: true,
      canDisplay: true,
      requiresRevalidation: false
    };
  }
  return {
    canAlert: false,
    canDisplay: false,
    requiresRevalidation: true,
    reason: "requires_duffel_offer_retrieval_revalidation"
  };
}

export function normalizeDuffelOffer(
  offer: DuffelOffer,
  input: SearchRoundTripInput,
  config: DuffelConfig,
  verifiedAtIso: string,
  displayIsRevalidated: boolean,
  nowMs: number
): ProviderOffer | null {
  if (!offer.id || !offer.total_amount || !offer.total_currency) return null;
  if (offer.total_currency !== config.currencyCode || config.currencyCode !== "MYR") return null;
  if (isExpired(offer.expires_at, nowMs)) return null;

  const amountMinor = parseDecimalMinorUnits(offer.total_amount);
  if (amountMinor === null || amountMinor <= 0) return null;

  const slices = offer.slices ?? [];
  if (!isRoundTripForInput(slices, input)) return null;

  const itineraries = slices
    .map((slice) => normalizeSlice(slice))
    .filter((itinerary): itinerary is ProviderItinerary => itinerary !== null);
  if (itineraries.length !== 2) return null;

  const carriers = new Set<string>();
  for (const itinerary of itineraries) {
    for (const segment of itinerary.segments) {
      if (segment.carrierCode) carriers.add(segment.carrierCode);
      if (segment.operatingCarrierCode) carriers.add(segment.operatingCarrierCode);
    }
  }

  const normalized: ProviderOffer = {
    provider: "duffel",
    providerOfferId: offer.id,
    originIata: input.originIata,
    destinationIata: input.destinationIata,
    departureDate: input.departureDate,
    returnDate: input.returnDate,
    cabinClass: "economy",
    adultCount: Math.max(1, input.adults ?? 1),
    price: {
      amountMinor,
      currency: "MYR"
    },
    itineraries,
    totalStops: itineraries.reduce((sum, itinerary) => sum + itinerary.stops, 0),
    carriers: [...carriers].sort(),
    durationMinutes: itineraries.reduce((sum, itinerary) => sum + itinerary.durationMinutes, 0),
    source: config.testModeDetected ? "duffel_test" : "duffel",
    lastVerifiedAt: verifiedAtIso,
    retentionMode: config.retentionMode,
    display: displayPolicy(displayIsRevalidated),
    revalidationPayload: {
      providerOfferId: offer.id,
      originalAmount: offer.total_amount,
      originalCurrency: offer.total_currency,
      expiresAt: offer.expires_at ?? null,
      liveMode: offer.live_mode === true
    }
  };

  if (offer.expires_at) normalized.expiresAt = offer.expires_at;
  const deepLink = typeof offer.deep_link === "string" ? offer.deep_link : offer.public_url;
  if (displayIsRevalidated && typeof deepLink === "string" && deepLink.length > 0) {
    normalized.deepLink = deepLink;
  }
  return normalized;
}

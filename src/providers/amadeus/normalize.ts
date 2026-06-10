import type { AmadeusConfig } from "../../config/amadeus.ts";
import type {
  ProviderItinerary,
  ProviderOffer,
  ProviderSegment,
  SearchRoundTripInput
} from "../types.ts";
import type { AmadeusFlightOffer, AmadeusItinerary, AmadeusSegment } from "./schemas.ts";

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

function normalizeSegment(segment: AmadeusSegment): ProviderSegment | null {
  const originIata = segment.departure?.iataCode;
  const destinationIata = segment.arrival?.iataCode;
  if (!originIata || !destinationIata) return null;

  const normalized: ProviderSegment = {
    originIata,
    destinationIata,
    durationMinutes: parseIsoDurationMinutes(segment.duration),
    technicalStops: segment.numberOfStops ?? 0
  };
  if (segment.departure?.at) normalized.departureAt = segment.departure.at;
  if (segment.arrival?.at) normalized.arrivalAt = segment.arrival.at;
  if (segment.carrierCode) normalized.carrierCode = segment.carrierCode;
  if (segment.operating?.carrierCode) normalized.operatingCarrierCode = segment.operating.carrierCode;
  if (segment.number) normalized.flightNumber = segment.number;
  return normalized;
}

function normalizeItinerary(itinerary: AmadeusItinerary): ProviderItinerary | null {
  const segments = (itinerary.segments ?? [])
    .map((segment) => normalizeSegment(segment))
    .filter((segment): segment is ProviderSegment => segment !== null);

  if (segments.length === 0) return null;

  const connectionStops = Math.max(0, segments.length - 1);
  const technicalStops = segments.reduce((sum, segment) => sum + segment.technicalStops, 0);
  const durationMinutes =
    parseIsoDurationMinutes(itinerary.duration) ||
    segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);

  return {
    durationMinutes,
    stops: connectionStops + technicalStops,
    segments
  };
}

export function normalizeAmadeusOffer(
  offer: AmadeusFlightOffer,
  input: SearchRoundTripInput,
  config: AmadeusConfig,
  verifiedAtIso: string,
  displayIsRevalidated: boolean
): ProviderOffer | null {
  const currency = offer.price?.currency;
  const total = offer.price?.total;
  if (currency !== config.currencyCode || !total) return null;

  const amountMinor = parseDecimalMinorUnits(total);
  if (amountMinor === null || amountMinor <= 0) return null;

  const itineraries = (offer.itineraries ?? [])
    .map((itinerary) => normalizeItinerary(itinerary))
    .filter((itinerary): itinerary is ProviderItinerary => itinerary !== null);

  if (itineraries.length === 0) return null;

  const carriers = new Set<string>();
  for (const itinerary of itineraries) {
    for (const segment of itinerary.segments) {
      if (segment.carrierCode) carriers.add(segment.carrierCode);
      if (segment.operatingCarrierCode) carriers.add(segment.operatingCarrierCode);
    }
  }

  const normalized: ProviderOffer = {
    provider: "amadeus",
    providerOfferId: offer.id ?? `amadeus-${input.originIata}-${input.destinationIata}-${input.departureDate}`,
    originIata: input.originIata,
    destinationIata: input.destinationIata,
    departureDate: input.departureDate,
    returnDate: input.returnDate,
    cabinClass: "economy",
    adultCount: input.adults ?? 1,
    price: {
      amountMinor,
      currency
    },
    itineraries,
    totalStops: itineraries.reduce((sum, itinerary) => sum + itinerary.stops, 0),
    carriers: [...carriers].sort(),
    durationMinutes: itineraries.reduce((sum, itinerary) => sum + itinerary.durationMinutes, 0),
    lastVerifiedAt: verifiedAtIso,
    retentionMode: config.retentionMode,
    display: displayIsRevalidated
      ? {
          canAlert: true,
          canDisplay: true,
          requiresRevalidation: false
        }
      : {
          canAlert: false,
          canDisplay: false,
          requiresRevalidation: true,
          reason: "requires_flight_offers_price_revalidation"
        },
    revalidationPayload: offer
  };
  if (offer.source) {
    normalized.source = offer.source;
  }
  return normalized;
}

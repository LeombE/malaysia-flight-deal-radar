import { AmadeusProviderError } from "./errors.ts";

export interface AmadeusTokenResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
  state?: string;
}

export interface AmadeusFlightOffersSearchResponse {
  data: AmadeusFlightOffer[];
}

export interface AmadeusFlightOffersPricingResponse {
  data: {
    type?: string;
    flightOffers: AmadeusFlightOffer[];
  };
}

export interface AmadeusFlightOffer {
  type?: string;
  id?: string;
  source?: string;
  price?: {
    currency?: string;
    total?: string;
  };
  itineraries?: AmadeusItinerary[];
  [key: string]: unknown;
}

export interface AmadeusItinerary {
  duration?: string;
  segments?: AmadeusSegment[];
}

export interface AmadeusSegment {
  departure?: {
    iataCode?: string;
    at?: string;
  };
  arrival?: {
    iataCode?: string;
    at?: string;
  };
  carrierCode?: string;
  number?: string;
  aircraft?: unknown;
  operating?: {
    carrierCode?: string;
  };
  duration?: string;
  numberOfStops?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new AmadeusProviderError(`Invalid Amadeus ${context} response`);
  }
  return value;
}

export function parseTokenResponse(value: unknown): AmadeusTokenResponse {
  const root = assertRecord(value, "OAuth token");
  if (
    root.token_type !== "Bearer" ||
    typeof root.access_token !== "string" ||
    root.access_token.length === 0 ||
    typeof root.expires_in !== "number"
  ) {
    throw new AmadeusProviderError("Invalid Amadeus OAuth token response");
  }

  return {
    token_type: root.token_type,
    access_token: root.access_token,
    expires_in: root.expires_in,
    state: typeof root.state === "string" ? root.state : undefined
  };
}

export function parseSearchResponse(value: unknown): AmadeusFlightOffersSearchResponse {
  const root = assertRecord(value, "Flight Offers Search");
  if (!Array.isArray(root.data)) {
    throw new AmadeusProviderError("Invalid Amadeus Flight Offers Search response");
  }
  return { data: root.data as AmadeusFlightOffer[] };
}

export function parsePricingResponse(value: unknown): AmadeusFlightOffersPricingResponse {
  const root = assertRecord(value, "Flight Offers Price");
  const data = assertRecord(root.data, "Flight Offers Price data");
  if (!Array.isArray(data.flightOffers)) {
    throw new AmadeusProviderError("Invalid Amadeus Flight Offers Price response");
  }
  return {
    data: {
      type: typeof data.type === "string" ? data.type : undefined,
      flightOffers: data.flightOffers as AmadeusFlightOffer[]
    }
  };
}


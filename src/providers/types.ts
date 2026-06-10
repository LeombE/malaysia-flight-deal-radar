export type ProviderRetentionMode = "NO_CACHE" | "AGGREGATE_ONLY" | "RAW_ALLOWED";

export type ProviderHealthStatus =
  | "disabled"
  | "available"
  | "healthy"
  | "degraded"
  | "rate_limited"
  | "unhealthy";

export interface ProviderHealth {
  provider: string;
  status: ProviderHealthStatus;
  checkedAt: string;
  message?: string;
  retryAfterMs?: number;
}

export interface SearchRoundTripInput {
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  adults?: number;
  maxOffers?: number;
}

export interface ProviderSegment {
  originIata: string;
  destinationIata: string;
  departureAt?: string;
  arrivalAt?: string;
  carrierCode?: string;
  operatingCarrierCode?: string;
  flightNumber?: string;
  durationMinutes: number;
  technicalStops: number;
}

export interface ProviderItinerary {
  durationMinutes: number;
  stops: number;
  segments: ProviderSegment[];
}

export interface ProviderOfferDisplayPolicy {
  canDisplay: boolean;
  canAlert: boolean;
  requiresRevalidation: boolean;
  reason?: string;
}

export interface ProviderOffer {
  provider: string;
  providerOfferId: string;
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  cabinClass: "economy";
  adultCount: number;
  price: {
    amountMinor: number;
    currency: string;
  };
  itineraries: ProviderItinerary[];
  totalStops: number;
  carriers: string[];
  durationMinutes: number;
  source?: string;
  deepLink?: string;
  expiresAt?: string;
  lastVerifiedAt: string;
  retentionMode: ProviderRetentionMode;
  display: ProviderOfferDisplayPolicy;
  revalidationPayload?: unknown;
}

export interface RevalidateOfferInput {
  providerOfferId: string;
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  revalidationPayload?: unknown;
}

export interface FlightProvider {
  readonly name: string;
  isEnabled(): boolean;
  searchRoundTripOffers(input: SearchRoundTripInput): Promise<ProviderOffer[]>;
  revalidateOffer(input: RevalidateOfferInput): Promise<ProviderOffer | null>;
  getProviderHealth(): Promise<ProviderHealth>;
  getRetentionMode(): ProviderRetentionMode;
}

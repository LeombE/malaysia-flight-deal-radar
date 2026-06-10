import type { AmadeusConfig } from "../../config/amadeus.ts";
import type { SearchRoundTripInput } from "../types.ts";
import type { AmadeusFlightOffer } from "./schemas.ts";

function buildUrl(baseUrl: string, pathname: string): URL {
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

export function buildTokenRequest(config: AmadeusConfig): RequestInit & { url: string } {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId ?? "",
    client_secret: config.clientSecret ?? ""
  });

  return {
    url: buildUrl(config.baseUrl, "/v1/security/oauth2/token").toString(),
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  };
}

export function buildFlightOffersSearchUrl(
  config: AmadeusConfig,
  input: SearchRoundTripInput
): string {
  const url = buildUrl(config.baseUrl, "/v2/shopping/flight-offers");
  url.searchParams.set("originLocationCode", input.originIata);
  url.searchParams.set("destinationLocationCode", input.destinationIata);
  url.searchParams.set("departureDate", input.departureDate);
  url.searchParams.set("returnDate", input.returnDate);
  url.searchParams.set("adults", String(input.adults ?? 1));
  url.searchParams.set("travelClass", "ECONOMY");
  url.searchParams.set("currencyCode", config.currencyCode);
  url.searchParams.set("max", String(input.maxOffers ?? config.maxOffers));
  return url.toString();
}

export function buildPricingRequest(
  config: AmadeusConfig,
  flightOffer: AmadeusFlightOffer
): RequestInit & { url: string } {
  return {
    url: buildUrl(config.baseUrl, "/v1/shopping/flight-offers/pricing").toString(),
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.amadeus+json"
    },
    body: JSON.stringify({
      data: {
        type: "flight-offers-pricing",
        flightOffers: [flightOffer]
      }
    })
  };
}


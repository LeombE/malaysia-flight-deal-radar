import type { DuffelConfig } from "../../config/duffel.ts";
import type { SearchRoundTripInput } from "../types.ts";

export interface DuffelOfferRequestBody {
  data: {
    slices: Array<{
      origin: string;
      destination: string;
      departure_date: string;
    }>;
    passengers: Array<{
      type: "adult";
    }>;
    cabin_class: "economy";
    currency: string;
  };
}

export interface DuffelBuiltRequest {
  url: string;
  init: RequestInit;
  body: DuffelOfferRequestBody;
}

function buildUrl(baseUrl: string, pathname: string): URL {
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

export function buildDuffelOfferRequest(
  config: DuffelConfig,
  input: SearchRoundTripInput
): DuffelBuiltRequest {
  const url = buildUrl(config.apiBaseUrl, "/air/offer_requests");
  url.searchParams.set("return_offers", "true");

  const adultCount = Math.max(1, input.adults ?? 1);
  const body: DuffelOfferRequestBody = {
    data: {
      slices: [
        {
          origin: input.originIata,
          destination: input.destinationIata,
          departure_date: input.departureDate
        },
        {
          origin: input.destinationIata,
          destination: input.originIata,
          departure_date: input.returnDate
        }
      ],
      passengers: Array.from({ length: adultCount }, () => ({ type: "adult" as const })),
      cabin_class: "economy",
      currency: config.currencyCode
    }
  };

  return {
    url: url.toString(),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    body
  };
}

export function buildDuffelOfferGetUrl(config: DuffelConfig, offerId: string): string {
  return buildUrl(config.apiBaseUrl, `/air/offers/${encodeURIComponent(offerId)}`).toString();
}

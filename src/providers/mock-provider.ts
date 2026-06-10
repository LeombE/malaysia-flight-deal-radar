import type {
  FlightProvider,
  ProviderHealth,
  ProviderOffer,
  ProviderRetentionMode,
  RevalidateOfferInput,
  SearchRoundTripInput
} from "./types.ts";

export class MockProvider implements FlightProvider {
  readonly name = "mock";

  isEnabled(): boolean {
    return true;
  }

  getRetentionMode(): ProviderRetentionMode {
    return "RAW_ALLOWED";
  }

  async getProviderHealth(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      checkedAt: new Date().toISOString(),
      message: "Mock provider is always available for local tests"
    };
  }

  async searchRoundTripOffers(input: SearchRoundTripInput): Promise<ProviderOffer[]> {
    const priceSeed = input.originIata.charCodeAt(0) + input.destinationIata.charCodeAt(0);
    return [
      {
        provider: this.name,
        providerOfferId: `mock-${input.originIata}-${input.destinationIata}-${input.departureDate}`,
        originIata: input.originIata,
        destinationIata: input.destinationIata,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        cabinClass: "economy",
        adultCount: input.adults ?? 1,
        price: {
          amountMinor: (300 + priceSeed) * 100,
          currency: "MYR"
        },
        itineraries: [
          {
            durationMinutes: 180,
            stops: 0,
            segments: [
              {
                originIata: input.originIata,
                destinationIata: input.destinationIata,
                durationMinutes: 180,
                technicalStops: 0,
                carrierCode: "MH"
              }
            ]
          },
          {
            durationMinutes: 180,
            stops: 0,
            segments: [
              {
                originIata: input.destinationIata,
                destinationIata: input.originIata,
                durationMinutes: 180,
                technicalStops: 0,
                carrierCode: "MH"
              }
            ]
          }
        ],
        totalStops: 0,
        carriers: ["MH"],
        durationMinutes: 360,
        source: "mock",
        lastVerifiedAt: new Date().toISOString(),
        retentionMode: this.getRetentionMode(),
        display: {
          canAlert: true,
          canDisplay: true,
          requiresRevalidation: false
        }
      }
    ];
  }

  async revalidateOffer(input: RevalidateOfferInput): Promise<ProviderOffer | null> {
    const [originIata, destinationIata] = [input.originIata, input.destinationIata];
    const offers = await this.searchRoundTripOffers({
      originIata,
      destinationIata,
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      adults: 1
    });
    return offers[0] ?? null;
  }
}


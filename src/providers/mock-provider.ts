import type {
  FlightProvider,
  ProviderHealth,
  ProviderOffer,
  ProviderRetentionMode,
  RevalidateOfferInput,
  SearchRoundTripInput
} from "./types.ts";

interface MockRouteProfile {
  amountMinorMyr: number;
  carriers: string[];
  totalStops: number;
  totalDurationMinutes: number;
  outboundDurationMinutes: number;
  inboundDurationMinutes: number;
}

const DEMO_ROUTE_PROFILES: Record<string, MockRouteProfile> = {
  "KUL-BKK": {
    amountMinorMyr: 44_100,
    carriers: ["AK"],
    totalStops: 0,
    totalDurationMinutes: 270,
    outboundDurationMinutes: 135,
    inboundDurationMinutes: 135
  },
  "KUL-TPE": {
    amountMinorMyr: 46_900,
    carriers: ["OD"],
    totalStops: 0,
    totalDurationMinutes: 570,
    outboundDurationMinutes: 285,
    inboundDurationMinutes: 285
  },
  "KUL-SIN": {
    amountMinorMyr: 38_900,
    carriers: ["MH"],
    totalStops: 0,
    totalDurationMinutes: 150,
    outboundDurationMinutes: 75,
    inboundDurationMinutes: 75
  },
  "JHB-BKK": {
    amountMinorMyr: 45_200,
    carriers: ["AK", "FD"],
    totalStops: 1,
    totalDurationMinutes: 360,
    outboundDurationMinutes: 180,
    inboundDurationMinutes: 180
  },
  "SZB-NRT": {
    amountMinorMyr: 52_900,
    carriers: ["D7"],
    totalStops: 0,
    totalDurationMinutes: 860,
    outboundDurationMinutes: 430,
    inboundDurationMinutes: 430
  }
};

function profileKey(input: Pick<SearchRoundTripInput, "originIata" | "destinationIata">): string {
  return `${input.originIata.toUpperCase()}-${input.destinationIata.toUpperCase()}`;
}

function fallbackProfile(input: SearchRoundTripInput): MockRouteProfile {
  const priceSeed = input.originIata.charCodeAt(0) + input.destinationIata.charCodeAt(0);
  return {
    amountMinorMyr: (300 + priceSeed) * 100,
    carriers: ["MH"],
    totalStops: 0,
    totalDurationMinutes: 360,
    outboundDurationMinutes: 180,
    inboundDurationMinutes: 180
  };
}

function mockProfileFor(input: SearchRoundTripInput): MockRouteProfile {
  return DEMO_ROUTE_PROFILES[profileKey(input)] ?? fallbackProfile(input);
}

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
    const profile = mockProfileFor(input);
    const outboundCarrier = profile.carriers[0] ?? "MH";
    const inboundCarrier = profile.carriers[1] ?? outboundCarrier;
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
          amountMinor: profile.amountMinorMyr,
          currency: "MYR"
        },
        itineraries: [
          {
            durationMinutes: profile.outboundDurationMinutes,
            stops: profile.totalStops > 0 ? 1 : 0,
            segments: [
              {
                originIata: input.originIata,
                destinationIata: input.destinationIata,
                durationMinutes: profile.outboundDurationMinutes,
                technicalStops: profile.totalStops > 0 ? 1 : 0,
                carrierCode: outboundCarrier
              }
            ]
          },
          {
            durationMinutes: profile.inboundDurationMinutes,
            stops: 0,
            segments: [
              {
                originIata: input.destinationIata,
                destinationIata: input.originIata,
                durationMinutes: profile.inboundDurationMinutes,
                technicalStops: 0,
                carrierCode: inboundCarrier
              }
            ]
          }
        ],
        totalStops: profile.totalStops,
        carriers: profile.carriers,
        durationMinutes: profile.totalDurationMinutes,
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

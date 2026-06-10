import { MockProvider } from "../providers/mock-provider.ts";
import type {
  ProviderHealth,
  ProviderOffer,
  RevalidateOfferInput,
  SearchRoundTripInput
} from "../providers/types.ts";

function withDemoFreshness(offer: ProviderOffer, nowIso: string, revalidated: boolean): ProviderOffer {
  return {
    ...offer,
    source: "mock-demo",
    lastVerifiedAt: nowIso,
    display: revalidated
      ? {
          canAlert: true,
          canDisplay: true,
          requiresRevalidation: false
        }
      : {
          canAlert: false,
          canDisplay: false,
          requiresRevalidation: true,
          reason: "requires_revalidation"
        }
  };
}

export class DemoMockProvider extends MockProvider {
  private readonly nowIso: string;

  constructor(nowIso: string) {
    super();
    this.nowIso = nowIso;
  }

  override async getProviderHealth(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      checkedAt: this.nowIso,
      message: "Deterministic MockProvider for local demo data"
    };
  }

  override async searchRoundTripOffers(input: SearchRoundTripInput): Promise<ProviderOffer[]> {
    const offers = await super.searchRoundTripOffers(input);
    return offers.map((offer) => withDemoFreshness(offer, this.nowIso, false));
  }

  override async revalidateOffer(input: RevalidateOfferInput): Promise<ProviderOffer | null> {
    const offer = await super.revalidateOffer(input);
    return offer ? withDemoFreshness(offer, this.nowIso, true) : null;
  }
}

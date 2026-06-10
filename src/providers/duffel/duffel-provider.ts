import type { DuffelConfig } from "../../config/duffel.ts";
import { isDuffelEnabled } from "../../config/duffel.ts";
import { parseRealProviderConfig, type RealProviderConfig } from "../../config/real-providers.ts";
import type {
  FlightProvider,
  ProviderHealth,
  ProviderOffer,
  ProviderRetentionMode,
  RevalidateOfferInput,
  SearchRoundTripInput
} from "../types.ts";
import { DuffelProviderError } from "./errors.ts";
import { DuffelHttpClient } from "./http-client.ts";
import { normalizeDuffelOffer } from "./normalize.ts";
import { buildDuffelOfferGetUrl, buildDuffelOfferRequest } from "./request-builder.ts";
import { parseOfferRequestResponse, parseOfferResponse } from "./schemas.ts";

export interface DuffelProviderDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function nowIso(now: () => number): string {
  return new Date(now()).toISOString();
}

export class DuffelProvider implements FlightProvider {
  readonly name = "duffel";
  private readonly config: DuffelConfig;
  private readonly realProviderConfig: RealProviderConfig;
  private readonly now: () => number;
  private readonly client: DuffelHttpClient;
  private health: ProviderHealth;

  constructor(
    config: DuffelConfig,
    realProviderConfig: RealProviderConfig = parseRealProviderConfig({}),
    deps: DuffelProviderDeps = {}
  ) {
    this.config = config;
    this.realProviderConfig = realProviderConfig;
    this.now = deps.now ?? Date.now;
    const clientDeps: DuffelProviderDeps = {};
    if (deps.fetch) clientDeps.fetch = deps.fetch;
    if (deps.sleep) clientDeps.sleep = deps.sleep;
    this.client = new DuffelHttpClient(config, clientDeps);
    this.health = this.buildHealth(
      this.isEnabled() ? "available" : "disabled",
      this.disabledMessage() ?? "Duffel ready for offer requests"
    );
  }

  isEnabled(): boolean {
    return isDuffelEnabled(this.config, this.realProviderConfig);
  }

  getRetentionMode(): ProviderRetentionMode {
    return this.config.retentionMode;
  }

  async getProviderHealth(): Promise<ProviderHealth> {
    const disabledMessage = this.disabledMessage();
    if (disabledMessage) {
      this.health = this.buildHealth("disabled", disabledMessage);
    }
    return this.health;
  }

  async searchRoundTripOffers(input: SearchRoundTripInput): Promise<ProviderOffer[]> {
    if (!this.isEnabled()) return [];
    if (this.config.currencyCode !== "MYR") return [];

    const request = buildDuffelOfferRequest(this.config, input);
    const response = await this.requestJson(request.url, request.init, "Offer Request");
    const parsed = parseOfferRequestResponse(response);
    const verifiedAt = nowIso(this.now);
    const nowMs = this.now();
    const offers = parsed.data.offers
      .map((offer) => normalizeDuffelOffer(offer, input, this.config, verifiedAt, false, nowMs))
      .filter((offer): offer is ProviderOffer => offer !== null);

    this.health = this.buildHealth("healthy", "Duffel offer request succeeded");
    return offers;
  }

  async revalidateOffer(input: RevalidateOfferInput): Promise<ProviderOffer | null> {
    if (!this.isEnabled()) return null;

    const response = await this.requestJson(
      buildDuffelOfferGetUrl(this.config, input.providerOfferId),
      { method: "GET" },
      "Offer retrieval"
    );
    const parsed = parseOfferResponse(response);
    const offer = normalizeDuffelOffer(
      parsed.data,
      {
        originIata: input.originIata,
        destinationIata: input.destinationIata,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        adults: 1
      },
      this.config,
      nowIso(this.now),
      true,
      this.now()
    );

    if (offer) {
      this.health = this.buildHealth("healthy", "Duffel offer retrieval revalidation succeeded");
    }
    return offer;
  }

  private async requestJson(url: string, init: RequestInit, context: string): Promise<unknown> {
    try {
      return await this.client.requestJson(url, init, context);
    } catch (error) {
      if (error instanceof DuffelProviderError) {
        this.health = this.healthFromError(error, context);
      }
      throw error;
    }
  }

  private disabledMessage(): string | null {
    if (!this.config.accessToken) return "Duffel access token missing";
    if (!this.realProviderConfig.enableRealProviders) return "Duffel disabled because real providers are disabled";
    if (this.realProviderConfig.realProviderDryRun) return "Duffel disabled by real-provider dry-run mode";
    if (this.realProviderConfig.defaultRealProvider !== "duffel") return "Duffel is not the selected real provider";
    if (this.config.currencyCode !== "MYR") return "Duffel disabled because only MYR normalization is supported";
    return null;
  }

  private buildHealth(status: ProviderHealth["status"], message: string): ProviderHealth {
    return {
      provider: this.name,
      status,
      checkedAt: nowIso(this.now),
      message
    };
  }

  private healthFromError(error: DuffelProviderError, context: string): ProviderHealth {
    if (error.status === 429) {
      const health = this.buildHealth("rate_limited", `${context} rate limited`);
      if (error.retryAfterMs !== undefined) health.retryAfterMs = error.retryAfterMs;
      return health;
    }
    if (error.status === 401 || error.status === 403) {
      return this.buildHealth("unhealthy", `${context} auth/access failed`);
    }
    if (error.status && error.status >= 500) {
      return this.buildHealth("degraded", `${context} transient failure`);
    }
    return this.buildHealth("degraded", `${context} failed`);
  }
}

import type { AmadeusConfig } from "../../config/amadeus.ts";
import { isAmadeusEnabled } from "../../config/amadeus.ts";
import type {
  FlightProvider,
  ProviderHealth,
  ProviderOffer,
  ProviderRetentionMode,
  RevalidateOfferInput,
  SearchRoundTripInput
} from "../types.ts";
import { AmadeusTokenManager } from "./auth.ts";
import { AmadeusProviderError } from "./errors.ts";
import { normalizeAmadeusOffer } from "./normalize.ts";
import { buildFlightOffersSearchUrl, buildPricingRequest } from "./request-builder.ts";
import { AmadeusRequestLimiter, parseRetryAfterMs, withRetry } from "./retry.ts";
import { parsePricingResponse, parseSearchResponse } from "./schemas.ts";

export interface AmadeusProviderDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(now: () => number): string {
  return new Date(now()).toISOString();
}

export class AmadeusProvider implements FlightProvider {
  readonly name = "amadeus";
  private readonly config: AmadeusConfig;
  private health: ProviderHealth;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly tokenManager: AmadeusTokenManager;
  private readonly limiter: AmadeusRequestLimiter;

  constructor(
    config: AmadeusConfig,
    deps: AmadeusProviderDeps = {}
  ) {
    this.config = config;
    this.fetchImpl = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? defaultSleep;
    this.tokenManager = new AmadeusTokenManager(config, {
      fetch: this.fetchImpl,
      now: this.now
    });
    this.limiter = new AmadeusRequestLimiter(
      config.maxConcurrency,
      config.minRequestIntervalMs,
      this.now,
      this.sleep
    );
    this.health = this.buildHealth(
      this.isEnabled() ? "available" : "disabled",
      this.isEnabled() ? "Amadeus credentials configured" : "Amadeus credentials missing"
    );
  }

  isEnabled(): boolean {
    return isAmadeusEnabled(this.config);
  }

  getRetentionMode(): ProviderRetentionMode {
    return this.config.retentionMode;
  }

  async getProviderHealth(): Promise<ProviderHealth> {
    if (!this.isEnabled()) {
      this.health = this.buildHealth("disabled", "Amadeus credentials missing");
    }
    return this.health;
  }

  async searchRoundTripOffers(input: SearchRoundTripInput): Promise<ProviderOffer[]> {
    if (!this.isEnabled()) return [];

    const response = await this.requestJsonWithAuth(
      () => ({
        url: buildFlightOffersSearchUrl(this.config, input),
        init: { method: "GET" }
      }),
      "Flight Offers Search"
    );
    const parsed = parseSearchResponse(response);
    const verifiedAtIso = nowIso(this.now);
    const offers = parsed.data
      .map((offer) => normalizeAmadeusOffer(offer, input, this.config, verifiedAtIso, false))
      .filter((offer): offer is ProviderOffer => offer !== null);

    this.health = this.buildHealth("healthy", "Amadeus search succeeded");
    return offers;
  }

  async revalidateOffer(input: RevalidateOfferInput): Promise<ProviderOffer | null> {
    if (!this.isEnabled() || !input.revalidationPayload) return null;

    const response = await this.requestJsonWithAuth(
      () => {
        const request = buildPricingRequest(this.config, input.revalidationPayload as never);
        return {
          url: request.url,
          init: {
            method: request.method,
            headers: request.headers,
            body: request.body
          }
        };
      },
      "Flight Offers Price"
    );

    const parsed = parsePricingResponse(response);
    const pricedOffer = parsed.data.flightOffers[0];
    if (!pricedOffer) return null;

    const offer = normalizeAmadeusOffer(
      pricedOffer,
      {
        originIata: input.originIata,
        destinationIata: input.destinationIata,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        adults: 1
      },
      this.config,
      nowIso(this.now),
      true
    );

    this.health = this.buildHealth("healthy", "Amadeus pricing revalidation succeeded");
    return offer;
  }

  private async requestJsonWithAuth(
    buildRequest: () => { url: string; init: RequestInit },
    context: string
  ): Promise<unknown> {
    return withRetry(
      async () => {
        try {
          return await this.doAuthenticatedRequest(buildRequest, context, false);
        } catch (error) {
          if (error instanceof AmadeusProviderError && error.status === 401) {
            return this.doAuthenticatedRequest(buildRequest, context, true);
          }
          throw error;
        }
      },
      {
        maxAttempts: this.config.maxRetryAttempts,
        baseDelayMs: this.config.retryBaseDelayMs,
        maxDelayMs: this.config.retryMaxDelayMs,
        sleep: this.sleep
      }
    ).catch((error) => {
      if (error instanceof AmadeusProviderError) {
        this.health = this.healthFromError(error, context);
      }
      throw error;
    });
  }

  private async doAuthenticatedRequest(
    buildRequest: () => { url: string; init: RequestInit },
    context: string,
    forceTokenRefresh: boolean
  ): Promise<unknown> {
    const token = await this.tokenManager.getAccessToken(forceTokenRefresh);
    const request = buildRequest();
    const headers = new Headers(request.init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");

    return this.limiter.run(async () => {
      const response = await this.fetchImpl(request.url, {
        ...request.init,
        headers
      });
      if (!response.ok) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
        throw new AmadeusProviderError(`Amadeus ${context} failed with HTTP ${response.status}`, {
          status: response.status,
          retryAfterMs
        });
      }
      return response.json();
    });
  }

  private buildHealth(status: ProviderHealth["status"], message: string): ProviderHealth {
    return {
      provider: this.name,
      status,
      checkedAt: nowIso(this.now),
      message
    };
  }

  private healthFromError(error: AmadeusProviderError, context: string): ProviderHealth {
    if (error.status === 429) {
      return {
        ...this.buildHealth("rate_limited", `${context} rate limited`),
        retryAfterMs: error.retryAfterMs
      };
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

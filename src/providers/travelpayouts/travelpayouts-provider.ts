import type { CachedProviderConfig } from "../../config/cached-providers.ts";
import type { TravelpayoutsConfig } from "../../config/travelpayouts.ts";
import { isTravelpayoutsEnabled } from "../../config/travelpayouts.ts";
import type { CachedFareProvider, PriceCalendarSearchInput } from "../cached-types.ts";
import type { ProviderHealth, ProviderRetentionMode } from "../types.ts";
import { TravelpayoutsProviderError } from "./errors.ts";
import { TravelpayoutsHttpClient } from "./http-client.ts";
import { normalizeTravelpayoutsRows } from "./normalize.ts";
import { buildLatestUrl, buildMonthMatrixUrl, buildWeekMatrixUrl, type TravelpayoutsEndpoint } from "./request-builder.ts";
import { parseTravelpayoutsResponse } from "./schemas.ts";
import type { PriceCalendarApiRecord } from "../../routes/api-types.ts";

export interface TravelpayoutsProviderDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function nowIso(now: () => number): string {
  return new Date(now()).toISOString();
}

export class TravelpayoutsProvider implements CachedFareProvider {
  readonly name = "travelpayouts";
  readonly cachedDataSource = true;
  readonly liveGuarantee = false;
  private readonly config: TravelpayoutsConfig;
  private readonly cachedProviderConfig: CachedProviderConfig;
  private readonly now: () => number;
  private readonly client: TravelpayoutsHttpClient;
  private health: ProviderHealth;

  constructor(
    config: TravelpayoutsConfig,
    cachedProviderConfig: CachedProviderConfig,
    deps: TravelpayoutsProviderDeps = {}
  ) {
    this.config = config;
    this.cachedProviderConfig = cachedProviderConfig;
    this.now = deps.now ?? Date.now;
    const clientDeps: TravelpayoutsProviderDeps = {};
    if (deps.fetch) clientDeps.fetch = deps.fetch;
    if (deps.sleep) clientDeps.sleep = deps.sleep;
    this.client = new TravelpayoutsHttpClient(config, clientDeps);
    this.health = this.buildHealth(
      this.isEnabled() ? "available" : "disabled",
      this.disabledMessage() ?? "Travelpayouts cached fare provider ready"
    );
  }

  isEnabled(): boolean {
    return isTravelpayoutsEnabled(this.config, this.cachedProviderConfig);
  }

  getRetentionMode(): ProviderRetentionMode {
    return this.config.retentionMode;
  }

  async getProviderHealth(): Promise<ProviderHealth> {
    const disabledMessage = this.disabledMessage();
    if (disabledMessage) this.health = this.buildHealth("disabled", disabledMessage);
    return this.health;
  }

  searchLatest(input: PriceCalendarSearchInput): Promise<PriceCalendarApiRecord[]> {
    return this.search("v2/prices/latest", buildLatestUrl(this.config, input), input);
  }

  searchMonthMatrix(input: PriceCalendarSearchInput): Promise<PriceCalendarApiRecord[]> {
    return this.search("v2/prices/month-matrix", buildMonthMatrixUrl(this.config, input), input);
  }

  searchWeekMatrix(input: PriceCalendarSearchInput): Promise<PriceCalendarApiRecord[]> {
    return this.search("v2/prices/week-matrix", buildWeekMatrixUrl(this.config, input), input);
  }

  private async search(
    endpoint: TravelpayoutsEndpoint,
    url: string,
    input: PriceCalendarSearchInput
  ): Promise<PriceCalendarApiRecord[]> {
    if (!this.isEnabled()) return [];
    try {
      const response = await this.client.requestJson(url, endpoint);
      const parsed = parseTravelpayoutsResponse(response);
      const rows = normalizeTravelpayoutsRows({
        rows: parsed.data,
        search: input,
        config: this.config,
        endpoint,
        retrievedAtIso: nowIso(this.now),
        nowMs: this.now()
      });
      this.health = this.buildHealth("healthy", `Travelpayouts ${endpoint} request succeeded`);
      return rows;
    } catch (error) {
      if (error instanceof TravelpayoutsProviderError) {
        this.health = this.healthFromError(error, endpoint);
      }
      throw error;
    }
  }

  private disabledMessage(): string | null {
    if (!this.config.token) return "Travelpayouts token missing";
    if (!this.cachedProviderConfig.enableCachedFareProvider) return "Travelpayouts disabled because cached fare provider is disabled";
    if (this.cachedProviderConfig.cachedProviderDryRun) return "Travelpayouts disabled by cached-provider dry-run mode";
    if (this.cachedProviderConfig.defaultCachedProvider !== "travelpayouts") return "Travelpayouts is not the selected cached provider";
    if (this.config.retentionMode !== "AGGREGATE_ONLY" && this.config.retentionMode !== "NO_CACHE") {
      return "Travelpayouts disabled because raw payload retention is not allowed";
    }
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

  private healthFromError(error: TravelpayoutsProviderError, context: string): ProviderHealth {
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

import type { CachedProviderConfig } from "./cached-providers.ts";
import type { ProviderRetentionMode } from "../providers/types.ts";

export interface TravelpayoutsConfig {
  token: string | undefined;
  apiBaseUrl: string;
  currency: string;
  retentionMode: ProviderRetentionMode;
  timeoutMs: number;
  retryLimit: number;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseRetentionMode(value: string | undefined): ProviderRetentionMode {
  if (value === "NO_CACHE" || value === "RAW_ALLOWED") return value;
  return "AGGREGATE_ONLY";
}

export function parseTravelpayoutsConfig(env: Record<string, string | undefined>): TravelpayoutsConfig {
  return {
    token: env.TRAVELPAYOUTS_TOKEN || undefined,
    apiBaseUrl: env.TRAVELPAYOUTS_API_BASE_URL || "https://api.travelpayouts.com",
    currency: (env.TRAVELPAYOUTS_CURRENCY || "MYR").toUpperCase(),
    retentionMode: parseRetentionMode(env.TRAVELPAYOUTS_RETENTION_MODE),
    timeoutMs: Math.max(1, parseInteger(env.TRAVELPAYOUTS_TIMEOUT_MS, 10_000)),
    retryLimit: parseInteger(env.TRAVELPAYOUTS_RETRY_LIMIT, 1)
  };
}

export function isTravelpayoutsConfigured(config: TravelpayoutsConfig): boolean {
  return Boolean(config.token);
}

export function isTravelpayoutsEnabled(
  config: TravelpayoutsConfig,
  cachedProviderConfig: CachedProviderConfig
): boolean {
  return Boolean(
    config.token &&
    cachedProviderConfig.enableCachedFareProvider &&
    !cachedProviderConfig.cachedProviderDryRun &&
    cachedProviderConfig.defaultCachedProvider === "travelpayouts" &&
    (config.retentionMode === "AGGREGATE_ONLY" || config.retentionMode === "NO_CACHE")
  );
}

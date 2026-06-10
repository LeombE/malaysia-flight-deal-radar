import type { ProviderRetentionMode } from "../providers/types.ts";

export interface AmadeusConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  baseUrl: string;
  currencyCode: string;
  retentionMode: ProviderRetentionMode;
  maxRetryAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  minRequestIntervalMs: number;
  maxConcurrency: number;
  tokenSafetyBufferMs: number;
  maxOffers: number;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseRetentionMode(value: string | undefined): ProviderRetentionMode {
  if (value === "AGGREGATE_ONLY" || value === "RAW_ALLOWED") return value;
  return "NO_CACHE";
}

export function parseAmadeusConfig(env: Record<string, string | undefined>): AmadeusConfig {
  return {
    clientId: env.AMADEUS_CLIENT_ID || undefined,
    clientSecret: env.AMADEUS_CLIENT_SECRET || undefined,
    baseUrl: env.AMADEUS_BASE_URL || "https://test.api.amadeus.com",
    currencyCode: env.AMADEUS_CURRENCY_CODE || "MYR",
    retentionMode: parseRetentionMode(env.AMADEUS_RETENTION_MODE),
    maxRetryAttempts: parseInteger(env.AMADEUS_MAX_RETRY_ATTEMPTS, 3),
    retryBaseDelayMs: parseInteger(env.AMADEUS_RETRY_BASE_DELAY_MS, 250),
    retryMaxDelayMs: parseInteger(env.AMADEUS_RETRY_MAX_DELAY_MS, 2_000),
    minRequestIntervalMs: parseInteger(env.AMADEUS_MIN_REQUEST_INTERVAL_MS, 100),
    maxConcurrency: Math.max(1, parseInteger(env.AMADEUS_MAX_CONCURRENCY, 1)),
    tokenSafetyBufferMs: parseInteger(env.AMADEUS_TOKEN_SAFETY_BUFFER_MS, 60_000),
    maxOffers: Math.max(1, parseInteger(env.AMADEUS_MAX_OFFERS, 20))
  };
}

export function isAmadeusEnabled(config: AmadeusConfig): boolean {
  return Boolean(config.clientId && config.clientSecret);
}

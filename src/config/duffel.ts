import type { RealProviderConfig } from "./real-providers.ts";
import type { ProviderRetentionMode } from "../providers/types.ts";

export interface DuffelConfig {
  accessToken: string | undefined;
  apiBaseUrl: string;
  apiVersion: string;
  currencyCode: string;
  testModeDetected: boolean;
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
  if (value === "AGGREGATE_ONLY" || value === "RAW_ALLOWED") return value;
  return "NO_CACHE";
}

export function parseDuffelConfig(env: Record<string, string | undefined>): DuffelConfig {
  const accessToken = env.DUFFEL_ACCESS_TOKEN || undefined;
  return {
    accessToken,
    apiBaseUrl: env.DUFFEL_API_BASE_URL || "https://api.duffel.com",
    apiVersion: env.DUFFEL_API_VERSION || "v2",
    currencyCode: (env.DUFFEL_CURRENCY_CODE || "MYR").toUpperCase(),
    testModeDetected: accessToken?.startsWith("duffel_test_") ?? false,
    retentionMode: parseRetentionMode(env.DUFFEL_RETENTION_MODE),
    timeoutMs: Math.max(1, parseInteger(env.DUFFEL_TIMEOUT_MS, 10_000)),
    retryLimit: parseInteger(env.DUFFEL_RETRY_LIMIT, 2)
  };
}

export function isDuffelConfigured(config: DuffelConfig): boolean {
  return Boolean(config.accessToken);
}

export function isDuffelEnabled(config: DuffelConfig, realProviderConfig: RealProviderConfig): boolean {
  return Boolean(
    config.accessToken &&
    realProviderConfig.enableRealProviders &&
    !realProviderConfig.realProviderDryRun &&
    realProviderConfig.defaultRealProvider === "duffel" &&
    config.currencyCode === "MYR" &&
    config.retentionMode === "NO_CACHE"
  );
}

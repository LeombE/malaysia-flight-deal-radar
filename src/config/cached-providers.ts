export interface CachedProviderConfig {
  enableCachedFareProvider: boolean;
  cachedProviderDryRun: boolean;
  defaultCachedProvider: string | null;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseProviderName(value: string | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function parseCachedProviderConfig(env: Record<string, string | undefined>): CachedProviderConfig {
  return {
    enableCachedFareProvider: parseBoolean(env.ENABLE_CACHED_FARE_PROVIDER, false),
    cachedProviderDryRun: parseBoolean(env.CACHED_PROVIDER_DRY_RUN, true),
    defaultCachedProvider: parseProviderName(env.DEFAULT_CACHED_PROVIDER) ?? "travelpayouts"
  };
}

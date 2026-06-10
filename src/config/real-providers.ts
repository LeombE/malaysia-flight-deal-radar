export interface RealProviderConfig {
  enableRealProviders: boolean;
  realProviderDryRun: boolean;
  defaultRealProvider: string | null;
  maxRealProviderSearchesPerRun: number;
  maxRealProviderDailyBudget: number;
  realProviderTimeoutMs: number;
  realProviderRetryLimit: number;
  revalidateBeforeDisplayMinutes: number;
  revalidateBeforeAlertMinutes: number;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseProviderName(value: string | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function parseRealProviderConfig(env: Record<string, string | undefined>): RealProviderConfig {
  return {
    enableRealProviders: parseBoolean(env.ENABLE_REAL_PROVIDERS, false),
    realProviderDryRun: parseBoolean(env.REAL_PROVIDER_DRY_RUN, true),
    defaultRealProvider: parseProviderName(env.DEFAULT_REAL_PROVIDER),
    maxRealProviderSearchesPerRun: parsePositiveInteger(env.MAX_REAL_PROVIDER_SEARCHES_PER_RUN, 5),
    maxRealProviderDailyBudget: parsePositiveInteger(env.MAX_REAL_PROVIDER_DAILY_BUDGET, 20),
    realProviderTimeoutMs: parsePositiveInteger(env.REAL_PROVIDER_TIMEOUT_MS, 10_000),
    realProviderRetryLimit: parsePositiveInteger(env.REAL_PROVIDER_RETRY_LIMIT, 2),
    revalidateBeforeDisplayMinutes: parsePositiveInteger(env.REVALIDATE_BEFORE_DISPLAY_MINUTES, 15),
    revalidateBeforeAlertMinutes: parsePositiveInteger(env.REVALIDATE_BEFORE_ALERT_MINUTES, 30)
  };
}

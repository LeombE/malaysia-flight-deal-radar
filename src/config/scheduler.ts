export interface SchedulerConfig {
  maxSearchesPerCronRun: number;
  maxProviderConcurrency: number;
  providerDailyBudget: number;
  revalidateBeforeAlertMinutes: number;
  defaultStayLengthDays: number;
  departureOffsetDays: number;
  providerFailureDegradeThreshold: number;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseSchedulerConfig(env: Record<string, string | undefined>): SchedulerConfig {
  return {
    maxSearchesPerCronRun: parsePositiveInteger(env.MAX_SEARCHES_PER_CRON_RUN, 50),
    maxProviderConcurrency: parsePositiveInteger(env.MAX_PROVIDER_CONCURRENCY, 3),
    providerDailyBudget: parsePositiveInteger(env.PROVIDER_DAILY_BUDGET, 50),
    revalidateBeforeAlertMinutes: parsePositiveInteger(env.REVALIDATE_BEFORE_ALERT_MINUTES, 30),
    defaultStayLengthDays: parsePositiveInteger(env.DEFAULT_STAY_LENGTH_DAYS, 5),
    departureOffsetDays: parsePositiveInteger(env.DEFAULT_DEPARTURE_OFFSET_DAYS, 45),
    providerFailureDegradeThreshold: parsePositiveInteger(env.PROVIDER_FAILURE_DEGRADE_THRESHOLD, 3)
  };
}


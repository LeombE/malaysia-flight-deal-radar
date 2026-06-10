import type { RealProviderConfig } from "../config/real-providers.ts";
import type { FlightProvider, ProviderRetentionMode } from "./types.ts";

export type ProviderReadinessBlockingReason =
  | "credentials_missing"
  | "real_providers_disabled"
  | "dry_run_enabled"
  | "provider_disabled"
  | "provider_not_selected"
  | "budget_exhausted"
  | "unsupported_retention_mode"
  | "missing_currency_support"
  | "missing_revalidation_support"
  | "unsupported_currency"
  | "revalidation_not_available";

export interface ProviderReadinessLimit {
  providerName: string;
  dailyBudget: number | null;
  usedToday: number | null;
}

export interface ProviderReadinessReport {
  provider_name: string;
  is_mock_provider: boolean;
  demo_ready: boolean;
  credentials_required: boolean;
  credentials_configured: boolean;
  test_mode: boolean;
  enabled: boolean;
  real_providers_enabled: boolean;
  dry_run_enabled: boolean;
  default_provider_selected: boolean;
  retention_mode: ProviderRetentionMode;
  daily_budget: number;
  used_today: number;
  remaining_budget: number;
  timeout_ms: number;
  retry_limit: number;
  revalidate_before_display_minutes: number;
  revalidate_before_alert_minutes: number;
  can_search_live: boolean;
  can_revalidate_live: boolean;
  blocking_reasons: ProviderReadinessBlockingReason[];
}

function isMockProvider(providerName: string): boolean {
  return providerName === "mock";
}

function providerCredentialsConfigured(
  providerName: string,
  env: Record<string, string | undefined>
): { required: boolean; configured: boolean } {
  if (providerName === "mock") return { required: false, configured: true };
  if (providerName === "amadeus") {
    return {
      required: true,
      configured: Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET)
    };
  }
  if (providerName === "duffel") {
    return {
      required: true,
      configured: Boolean(env.DUFFEL_ACCESS_TOKEN)
    };
  }
  const prefix = providerName.toUpperCase().replaceAll("-", "_");
  const apiKey = env[`${prefix}_API_KEY`] || env[`${prefix}_ACCESS_TOKEN`];
  return {
    required: true,
    configured: Boolean(apiKey)
  };
}

function providerCurrencySupported(providerName: string, env: Record<string, string | undefined>): boolean {
  if (providerName === "mock") return true;
  if (providerName === "amadeus") return (env.AMADEUS_CURRENCY_CODE || "MYR").toUpperCase() === "MYR";
  if (providerName === "duffel") return (env.DUFFEL_CURRENCY_CODE || "MYR").toUpperCase() === "MYR";
  return true;
}

function providerSupportsRevalidation(providerName: string): boolean {
  if (providerName === "mock") return true;
  if (providerName === "amadeus") return true;
  if (providerName === "duffel") return true;
  return false;
}

function providerTestMode(providerName: string, env: Record<string, string | undefined>): boolean {
  if (providerName === "duffel") return env.DUFFEL_ACCESS_TOKEN?.startsWith("duffel_test_") ?? false;
  return false;
}

function limitFor(
  providerName: string,
  limits: readonly ProviderReadinessLimit[] | undefined,
  config: RealProviderConfig
): { dailyBudget: number; usedToday: number } {
  const limit = limits?.find((entry) => entry.providerName === providerName);
  const configuredDailyBudget = Math.max(0, config.maxRealProviderDailyBudget);
  if (!limit) {
    return { dailyBudget: configuredDailyBudget, usedToday: 0 };
  }
  const limitDailyBudget = limit.dailyBudget ?? configuredDailyBudget;
  const dailyBudget = Math.max(0, Math.min(limitDailyBudget, configuredDailyBudget));
  return {
    dailyBudget,
    usedToday: Math.max(0, limit.usedToday ?? 0)
  };
}

export function buildProviderReadinessReport(input: {
  provider: FlightProvider;
  env: Record<string, string | undefined>;
  config: RealProviderConfig;
  providerLimits?: readonly ProviderReadinessLimit[];
}): ProviderReadinessReport {
  const providerName = input.provider.name;
  const mock = isMockProvider(providerName);
  const credentials = providerCredentialsConfigured(providerName, input.env);
  const limit = limitFor(providerName, input.providerLimits, input.config);
  const remainingBudget = Math.max(0, limit.dailyBudget - limit.usedToday);
  const selected = input.config.defaultRealProvider === providerName;
  const retentionMode = input.provider.getRetentionMode();
  const reasons: ProviderReadinessBlockingReason[] = [];
  const currencySupported = providerCurrencySupported(providerName, input.env);
  const revalidationSupported = providerSupportsRevalidation(providerName);

  if (!mock) {
    if (!input.config.enableRealProviders) reasons.push("real_providers_disabled");
    if (input.config.realProviderDryRun) reasons.push("dry_run_enabled");
    if (!credentials.configured) reasons.push("credentials_missing");
    if (!input.provider.isEnabled()) reasons.push("provider_disabled");
    if (!selected) reasons.push("provider_not_selected");
    if (remainingBudget <= 0) reasons.push("budget_exhausted");
    if (retentionMode !== "NO_CACHE") reasons.push("unsupported_retention_mode");
    if (!currencySupported) {
      reasons.push(providerName === "duffel" ? "unsupported_currency" : "missing_currency_support");
    }
    if (!revalidationSupported) {
      reasons.push(providerName === "duffel" ? "revalidation_not_available" : "missing_revalidation_support");
    }
  }

  const canUseLive = !mock && reasons.length === 0;

  return {
    provider_name: providerName,
    is_mock_provider: mock,
    demo_ready: mock && input.provider.isEnabled(),
    credentials_required: credentials.required,
    credentials_configured: credentials.configured,
    test_mode: providerTestMode(providerName, input.env),
    enabled: input.provider.isEnabled(),
    real_providers_enabled: input.config.enableRealProviders,
    dry_run_enabled: mock ? false : input.config.realProviderDryRun,
    default_provider_selected: mock ? false : selected,
    retention_mode: retentionMode,
    daily_budget: mock ? 0 : limit.dailyBudget,
    used_today: mock ? 0 : limit.usedToday,
    remaining_budget: mock ? 0 : remainingBudget,
    timeout_ms: input.config.realProviderTimeoutMs,
    retry_limit: input.config.realProviderRetryLimit,
    revalidate_before_display_minutes: input.config.revalidateBeforeDisplayMinutes,
    revalidate_before_alert_minutes: input.config.revalidateBeforeAlertMinutes,
    can_search_live: canUseLive,
    can_revalidate_live: canUseLive,
    blocking_reasons: [...new Set(reasons)]
  };
}

export function buildProviderReadinessReports(input: {
  providers: readonly FlightProvider[];
  env: Record<string, string | undefined>;
  config: RealProviderConfig;
  providerLimits?: readonly ProviderReadinessLimit[];
}): ProviderReadinessReport[] {
  return input.providers
    .map((provider) => {
      const reportInput: {
        provider: FlightProvider;
        env: Record<string, string | undefined>;
        config: RealProviderConfig;
        providerLimits?: readonly ProviderReadinessLimit[];
      } = {
        provider,
        env: input.env,
        config: input.config
      };
      if (input.providerLimits) reportInput.providerLimits = input.providerLimits;
      return buildProviderReadinessReport(reportInput);
    })
    .sort((left, right) => left.provider_name.localeCompare(right.provider_name));
}

export function readinessByProviderName(
  readiness: readonly ProviderReadinessReport[] | undefined
): Map<string, ProviderReadinessReport> {
  return new Map((readiness ?? []).map((report) => [report.provider_name, report]));
}

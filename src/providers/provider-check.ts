import { parseRealProviderConfig } from "../config/real-providers.ts";
import { buildProviderReadinessReports, type ProviderReadinessLimit } from "./readiness.ts";
import { createProviderRegistry, type ProviderRegistryOptions } from "./registry.ts";

export interface ProviderCheckRecord {
  provider_name: string;
  configured: boolean;
  enabled: boolean;
  dry_run: boolean;
  readiness_passed: boolean;
  can_search_live: boolean;
  can_revalidate_live: boolean;
  blocking_reasons: string[];
  last_smoke: ProviderCheckLastSmoke | null;
}

export interface ProviderCheckLastSmoke {
  status: "blocked" | "failed" | "succeeded" | "no_offers_returned";
  offers_returned: number | null;
  checked_at: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
}

export function buildProviderCheckReport(input: {
  env: Record<string, string | undefined>;
  providerLimits?: readonly ProviderReadinessLimit[];
  lastSmoke?: readonly (ProviderCheckLastSmoke & { provider_name: string })[];
  now?: () => number;
}): ProviderCheckRecord[] {
  const registryOptions: ProviderRegistryOptions = {
    fetch: async () => {
      throw new Error("provider:check must not make live network calls");
    },
    sleep: async () => {}
  };
  if (input.now) registryOptions.now = input.now;
  const providers = createProviderRegistry(input.env, registryOptions);
  const config = parseRealProviderConfig(input.env);
  const readinessInput: Parameters<typeof buildProviderReadinessReports>[0] = {
    providers,
    env: input.env,
    config
  };
  if (input.providerLimits) readinessInput.providerLimits = input.providerLimits;
  const lastSmokeByProvider = new Map(
    (input.lastSmoke ?? []).map((record) => [record.provider_name, record])
  );

  const preferredOrder = new Map([
    ["mock", 0],
    ["amadeus", 1],
    ["duffel", 2]
  ]);
  return buildProviderReadinessReports(readinessInput)
    .map((report) => ({
      provider_name: report.provider_name,
      configured: report.credentials_configured,
      enabled: report.enabled,
      dry_run: report.dry_run_enabled,
      readiness_passed: report.can_search_live && report.can_revalidate_live,
      can_search_live: report.can_search_live,
      can_revalidate_live: report.can_revalidate_live,
      blocking_reasons: report.blocking_reasons,
      last_smoke: lastSmokeByProvider.get(report.provider_name) ?? null
    }))
    .sort((left, right) =>
      (preferredOrder.get(left.provider_name) ?? 100) - (preferredOrder.get(right.provider_name) ?? 100) ||
      left.provider_name.localeCompare(right.provider_name)
    );
}

function bool(value: boolean): string {
  return value ? "true" : "false";
}

export function formatProviderCheckReport(records: readonly ProviderCheckRecord[]): string {
  const lines = ["Provider readiness"];
  for (const record of records) {
    lines.push(`- ${record.provider_name}`);
    lines.push(`  configured: ${bool(record.configured)}`);
    lines.push(`  enabled: ${bool(record.enabled)}`);
    lines.push(`  dry_run: ${bool(record.dry_run)}`);
    lines.push(`  readiness_passed: ${bool(record.readiness_passed)}`);
    lines.push(`  can_search_live: ${bool(record.can_search_live)}`);
    lines.push(`  can_revalidate_live: ${bool(record.can_revalidate_live)}`);
    lines.push(`  blocking_reasons: ${record.blocking_reasons.length > 0 ? record.blocking_reasons.join(", ") : "none"}`);
    if (record.last_smoke) {
      const route = record.last_smoke.origin && record.last_smoke.destination
        ? `${record.last_smoke.origin}-${record.last_smoke.destination} ${record.last_smoke.departure_date} to ${record.last_smoke.return_date}`
        : "unknown route";
      lines.push(`  last_smoke: ${record.last_smoke.status}, offers_returned=${record.last_smoke.offers_returned ?? "unknown"}, checked_at=${record.last_smoke.checked_at}, route=${route}`);
    } else {
      lines.push("  last_smoke: none");
    }
  }
  return lines.join("\n");
}

import type { DealApiRecord, ProviderHealthApiRecord } from "../routes/api-types.ts";
import { formatMyrFromMinor } from "../scoring/statistics.ts";

export interface HealthProviderSummary {
  provider_name: string;
  enabled: boolean;
  status: string;
}

export interface HealthApiResponse {
  ok?: boolean;
  status?: string;
  checked_at?: string;
  providers?: HealthProviderSummary[];
}

export interface ProviderHealthResponse {
  ok?: boolean;
  providers?: ProviderHealthApiRecord[];
}

export interface DealsResponse {
  ok?: boolean;
  deals?: DealApiRecord[];
}

export interface DeploymentHealthSnapshot {
  baseUrl: string;
  generatedAt: string;
  health: HealthApiResponse;
  providerHealth: ProviderHealthResponse;
  deals: DealApiRecord[];
  strongDeals: DealApiRecord[];
  suspectedDeals: DealApiRecord[];
}

export interface DeploymentHealthReportOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  generatedAt?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function fetchJson<T>(fetchImpl: typeof fetch, baseUrl: string, path: string): Promise<T> {
  const response = await fetchImpl(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed with HTTP ${response.status}`);
  }
  return await response.json() as T;
}

function sortDealsByScore(deals: DealApiRecord[]): DealApiRecord[] {
  return [...deals].sort((left, right) => {
    const scoreDiff = right.deal_score - left.deal_score;
    if (scoreDiff !== 0) return scoreDiff;
    return `${left.origin}-${left.destination}`.localeCompare(`${right.origin}-${right.destination}`);
  });
}

export async function fetchDeploymentHealthSnapshot(
  options: DeploymentHealthReportOptions
): Promise<DeploymentHealthSnapshot> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error("Worker base URL is required");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const [health, providerHealth, deals, strongDeals, suspectedDeals] = await Promise.all([
    fetchJson<HealthApiResponse>(fetchImpl, baseUrl, "/health"),
    fetchJson<ProviderHealthResponse>(fetchImpl, baseUrl, "/api/provider-health"),
    fetchJson<DealsResponse>(fetchImpl, baseUrl, "/api/deals"),
    fetchJson<DealsResponse>(fetchImpl, baseUrl, "/api/deals?deal_label=strong_deal"),
    fetchJson<DealsResponse>(fetchImpl, baseUrl, "/api/deals?deal_label=suspected_deal")
  ]);

  return {
    baseUrl,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    health,
    providerHealth,
    deals: sortDealsByScore(deals.deals ?? []),
    strongDeals: sortDealsByScore(strongDeals.deals ?? []),
    suspectedDeals: sortDealsByScore(suspectedDeals.deals ?? [])
  };
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function dealCounts(deals: DealApiRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    counts.set(deal.deal_label, (counts.get(deal.deal_label) ?? 0) + 1);
  }
  return counts;
}

function myrFromMinor(amountMinor: number | null): string {
  const formatted = formatMyrFromMinor(amountMinor);
  return formatted ? `RM${formatted}` : "n/a";
}

function readinessReasons(provider: ProviderHealthApiRecord): string {
  const reasons = provider.readiness?.blocking_reasons ?? [];
  return reasons.length > 0 ? reasons.join(", ") : "none";
}

function canSearchLive(provider: ProviderHealthApiRecord): string {
  return provider.readiness ? String(provider.readiness.can_search_live) : "n/a";
}

function providerRole(provider: ProviderHealthApiRecord): string {
  return provider.provider_name === "mock" ? "demo_provider" : "real_provider";
}

function dealRows(deals: DealApiRecord[], limit: number): string {
  const rows = deals.slice(0, limit);
  if (rows.length === 0) return "_None._";
  return [
    "| route | score | dates | price | baseline median | discount | provider | last verified |",
    "| --- | ---: | --- | ---: | ---: | ---: | --- | --- |",
    ...rows.map((deal) => [
      `| ${deal.origin} -> ${deal.destination}`,
      `${deal.deal_score}`,
      `${deal.departure_date} to ${deal.return_date}`,
      deal.display_price_rm,
      myrFromMinor(deal.baseline_median_minor_myr),
      `${deal.discount_pct}%`,
      deal.provider_name,
      deal.last_revalidated_at ?? "n/a"
    ].join(" | ") + " |")
  ].join("\n");
}

export function sanitizeReportText(text: string): string {
  return text
    .replace(/ADMIN_TOKEN/gi, "[redacted-secret-name]")
    .replace(/DUFFEL_ACCESS_TOKEN/gi, "[redacted-secret-name]")
    .replace(/TELEGRAM_BOT_TOKEN/gi, "[redacted-secret-name]")
    .replace(/TELEGRAM_CHAT_ID/gi, "[redacted-secret-name]")
    .replace(/AMADEUS_CLIENT_ID/gi, "[redacted-secret-name]")
    .replace(/AMADEUS_CLIENT_SECRET/gi, "[redacted-secret-name]")
    .replace(/SKYSCANNER_API_KEY/gi, "[redacted-secret-name]")
    .replace(/duffel_(?:test|live)_[A-Za-z0-9_-]+/gi, "[redacted-duffel-token]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/\b[0-9]{6,}:[A-Za-z0-9_-]{20,}\b/g, "[redacted-telegram-token]");
}

export function formatDeploymentHealthReport(snapshot: DeploymentHealthSnapshot): string {
  const providers = snapshot.providerHealth.providers ?? [];
  const mockProvider = providers.find((provider) => provider.provider_name === "mock");
  const realProviders = providers.filter((provider) => provider.provider_name !== "mock");
  const realProvidersDisabled = realProviders.length > 0 && realProviders.every((provider) =>
    !provider.enabled &&
    provider.readiness?.can_search_live !== true &&
    provider.readiness?.can_revalidate_live !== true
  );
  const mockHealthy = Boolean(
    mockProvider?.enabled &&
    ["healthy", "available"].includes(mockProvider.status)
  );
  const counts = dealCounts(snapshot.deals);
  const labelOrder = ["strong_deal", "suspected_deal", "no_deal", "watched_price", "urgent_revalidate", "expired"];

  const report = [
    "# Deployment Health Snapshot",
    "",
    `Generated: ${snapshot.generatedAt}`,
    `Worker base URL: ${snapshot.baseUrl}`,
    `Health status: ${snapshot.health.ok === true ? "ok" : "not_ok"} (${snapshot.health.status ?? "unknown"})`,
    `Mock provider healthy: ${yesNo(mockHealthy)}`,
    `Real providers disabled: ${yesNo(realProvidersDisabled)}`,
    "",
    "## Provider Readiness",
    "",
    "| provider | role | enabled | status | can_search_live | blocking_reasons |",
    "| --- | --- | ---: | --- | ---: | --- |",
    ...providers.map((provider) =>
      `| ${provider.provider_name} | ${providerRole(provider)} | ${provider.enabled} | ${provider.status} | ${canSearchLive(provider)} | ${readinessReasons(provider)} |`
    ),
    "",
    "## Deal Label Counts",
    "",
    "| deal_label | count |",
    "| --- | ---: |",
    ...labelOrder
      .filter((label) => counts.has(label))
      .map((label) => `| ${label} | ${counts.get(label) ?? 0} |`),
    "",
    "## Top Strong Deals",
    "",
    dealRows(snapshot.strongDeals, 5),
    "",
    "## Top Suspected Deals",
    "",
    dealRows(snapshot.suspectedDeals, 5),
    "",
    "## Safety Notes",
    "",
    "- This report is generated from read-only public endpoints.",
    "- Real providers remain disabled for this mock/demo deployment.",
    "- The report omits raw provider payloads, admin tokens, provider credentials, bookings, orders, payments, tickets, and passenger identity data.",
    ""
  ].join("\n");

  return sanitizeReportText(report);
}


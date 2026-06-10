import { parseRealProviderConfig, type RealProviderConfig } from "../config/real-providers.ts";
import { parseSchedulerConfig } from "../config/scheduler.ts";
import { D1ApiRepository } from "../db/d1-api-repository.ts";
import { D1ScanRepository, type D1DatabaseLike } from "../db/d1-scan-repository.ts";
import { createProviderRegistry } from "../providers/registry.ts";
import {
  buildProviderReadinessReports,
  type ProviderReadinessLimit,
  type ProviderReadinessReport
} from "../providers/readiness.ts";
import type { FlightProvider, ProviderHealth } from "../providers/types.ts";
import type { SchedulerConfig } from "../config/scheduler.ts";
import type { ScanRepository, ScanRunResult } from "../scanner/types.ts";
import { handleAdminScanRequest, type AdminScanDependencies } from "./admin-scan.ts";
import type {
  ApiRepository,
  DealFilters,
  DestinationFilters,
  PriceHistoryFilters,
  ProviderHealthApiRecord,
  ProviderLimitApiRecord
} from "./api-types.ts";
import { renderDashboardHtml } from "./dashboard.ts";

export interface FlightRadarEnv {
  ADMIN_TOKEN?: string;
  DB?: D1DatabaseLike;
  [key: string]: string | D1DatabaseLike | undefined;
}

export interface AppDependencies {
  apiRepository: ApiRepository;
  scanRepository?: ScanRepository;
  providers: FlightProvider[];
  schedulerConfig: SchedulerConfig;
  realProviderConfig?: RealProviderConfig;
  providerReadinessEnv?: Record<string, string | undefined>;
  providerReadiness?: ProviderReadinessReport[];
  runScan?: () => Promise<ScanRunResult>;
  now?: () => Date;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function notFound(): Response {
  return jsonResponse({ ok: false, error: "not_found" }, 404);
}

function methodNotAllowed(): Response {
  return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
}

function upperParam(params: URLSearchParams, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return value.toUpperCase();
  }
  return undefined;
}

function stringParam(params: URLSearchParams, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

function integerParam(params: URLSearchParams, ...keys: string[]): number | undefined {
  const value = stringParam(params, ...keys);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanParam(params: URLSearchParams, ...keys: string[]): boolean | undefined {
  const value = stringParam(params, ...keys);
  if (!value) return undefined;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function stringEnv(env: FlightRadarEnv): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }
  return output;
}

function destinationFilters(params: URLSearchParams): DestinationFilters {
  const filters: DestinationFilters = {};
  const originIata = upperParam(params, "origin_iata", "origin");
  const countryCode = upperParam(params, "country_code", "country");
  const regionGroup = upperParam(params, "region_group", "region");
  if (originIata) filters.origin_iata = originIata;
  if (countryCode) filters.country_code = countryCode;
  if (regionGroup) filters.region_group = regionGroup;
  return filters;
}

function dealFilters(params: URLSearchParams): DealFilters {
  const filters: DealFilters = {};
  const originIata = upperParam(params, "origin_iata", "origin");
  const destinationIata = upperParam(params, "destination_iata", "destination");
  const countryCode = upperParam(params, "country_code", "country");
  const regionGroup = upperParam(params, "region_group", "region");
  const dealLabel = stringParam(params, "deal_label");
  const providerName = stringParam(params, "provider_name", "provider");
  const departureFrom = stringParam(params, "departure_from");
  const departureTo = stringParam(params, "departure_to");
  const minScore = integerParam(params, "min_score");
  const maxStops = integerParam(params, "max_stops");
  const stayLengthDays = integerParam(params, "stay_length_days", "stay_length");
  const minStayLengthDays = integerParam(params, "min_stay_length_days");
  const maxStayLengthDays = integerParam(params, "max_stay_length_days");
  const onlyAlertEligible = booleanParam(params, "only_alert_eligible");
  const onlyRecentlyVerified = booleanParam(params, "only_recently_verified", "live_only");

  if (originIata) filters.origin_iata = originIata;
  if (destinationIata) filters.destination_iata = destinationIata;
  if (countryCode) filters.country_code = countryCode;
  if (regionGroup) filters.region_group = regionGroup;
  if (dealLabel) filters.deal_label = dealLabel as NonNullable<DealFilters["deal_label"]>;
  if (providerName) filters.provider_name = providerName;
  if (departureFrom) filters.departure_from = departureFrom;
  if (departureTo) filters.departure_to = departureTo;
  if (minScore !== undefined) filters.min_score = minScore;
  if (maxStops !== undefined) filters.max_stops = maxStops;
  if (stayLengthDays !== undefined) filters.stay_length_days = stayLengthDays;
  if (minStayLengthDays !== undefined) filters.min_stay_length_days = minStayLengthDays;
  if (maxStayLengthDays !== undefined) filters.max_stay_length_days = maxStayLengthDays;
  if (onlyAlertEligible !== undefined) filters.only_alert_eligible = onlyAlertEligible;
  if (onlyRecentlyVerified !== undefined) filters.only_recently_verified = onlyRecentlyVerified;
  return filters;
}

function priceHistoryFilters(params: URLSearchParams): PriceHistoryFilters {
  const filters: PriceHistoryFilters = {};
  const originIata = upperParam(params, "origin_iata", "origin");
  const destinationIata = upperParam(params, "destination_iata", "destination");
  const providerName = stringParam(params, "provider_name", "provider");
  const departureFrom = stringParam(params, "departure_from");
  const departureTo = stringParam(params, "departure_to");
  if (originIata) filters.origin_iata = originIata;
  if (destinationIata) filters.destination_iata = destinationIata;
  if (providerName) filters.provider_name = providerName;
  if (departureFrom) filters.departure_from = departureFrom;
  if (departureTo) filters.departure_to = departureTo;
  return filters;
}

function adminTokenStatus(request: Request, env: FlightRadarEnv): Response | null {
  if (!env.ADMIN_TOKEN) {
    return jsonResponse({ ok: false, error: "admin_endpoint_disabled" }, 503);
  }
  if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }
  return null;
}

async function providerHealthRecords(
  repository: ApiRepository,
  providers: FlightProvider[],
  options: {
    env?: Record<string, string | undefined>;
    realProviderConfig?: RealProviderConfig;
  } = {}
): Promise<ProviderHealthApiRecord[]> {
  const limits = await repository.listProviderLimits();
  const limitsByProvider = new Map(limits.map((limit) => [limit.provider_name, limit]));
  const readinessLimits: ProviderReadinessLimit[] = limits.map((limit) => ({
    providerName: limit.provider_name,
    dailyBudget: limit.daily_budget,
    usedToday: limit.used_today
  }));
  const readinessReports = options.env && options.realProviderConfig
    ? buildProviderReadinessReports({
        providers,
        env: options.env,
        config: options.realProviderConfig,
        providerLimits: readinessLimits
      })
    : [];
  const readinessByName = new Map(readinessReports.map((report) => [report.provider_name, report]));
  const seen = new Set<string>();
  const records: ProviderHealthApiRecord[] = [];

  for (const provider of providers) {
    const health: ProviderHealth = await provider.getProviderHealth().catch((error: unknown): ProviderHealth => ({
      provider: provider.name,
      status: "unhealthy",
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Provider health check failed"
    }));
    const limit = limitsByProvider.get(provider.name);
    const fallback: ProviderLimitApiRecord = {
      provider_name: provider.name,
      retention_mode: provider.getRetentionMode(),
      daily_budget: null,
      used_today: null,
      remaining_budget: null,
      health_status: health.status,
      last_success_at: null,
      last_failure_at: null,
      failure_count: 0
    };
    const merged = limit ?? fallback;
    const record: ProviderHealthApiRecord = {
      ...merged,
      enabled: provider.isEnabled(),
      status: health.status,
      checked_at: health.checkedAt,
      message: health.message ?? null,
      retry_after_ms: health.retryAfterMs ?? null
    };
    const readiness = readinessByName.get(provider.name);
    if (readiness) record.readiness = readiness;
    records.push(record);
    seen.add(provider.name);
  }

  for (const limit of limits) {
    if (seen.has(limit.provider_name)) continue;
    records.push({
      ...limit,
      enabled: false,
      status: limit.health_status ?? "unknown",
      checked_at: null,
      message: null,
      retry_after_ms: null
    });
  }

  return records.sort((left, right) => left.provider_name.localeCompare(right.provider_name));
}

export function createDefaultAppDependencies(env: FlightRadarEnv): AppDependencies {
  if (!env.DB) {
    throw new Error("D1 DB binding is required");
  }
  const envVars = stringEnv(env);
  const providers = createProviderRegistry(envVars);
  const realProviderConfig = parseRealProviderConfig(envVars);
  const providerReadiness = buildProviderReadinessReports({
    providers,
    env: envVars,
    config: realProviderConfig
  });
  return {
    apiRepository: new D1ApiRepository(env.DB),
    scanRepository: new D1ScanRepository(env.DB),
    providers,
    schedulerConfig: parseSchedulerConfig(envVars),
    realProviderConfig,
    providerReadinessEnv: envVars,
    providerReadiness
  };
}

export async function handleAppRequest(
  request: Request,
  env: FlightRadarEnv,
  dependencies: AppDependencies
): Promise<Response> {
  const url = new URL(request.url);
  const now = dependencies.now?.() ?? new Date();

  if (url.pathname === "/health") {
    if (request.method !== "GET") return methodNotAllowed();
    const healthOptions: { env?: Record<string, string | undefined>; realProviderConfig?: RealProviderConfig } = {};
    if (dependencies.providerReadinessEnv) healthOptions.env = dependencies.providerReadinessEnv;
    if (dependencies.realProviderConfig) healthOptions.realProviderConfig = dependencies.realProviderConfig;
    const providers = await providerHealthRecords(dependencies.apiRepository, dependencies.providers, healthOptions);
    return jsonResponse({
      ok: true,
      status: "ok",
      checked_at: now.toISOString(),
      providers: providers.map((provider) => ({
        provider_name: provider.provider_name,
        enabled: provider.enabled,
        status: provider.status
      }))
    });
  }

  if (url.pathname === "/" || url.pathname === "/dashboard") {
    if (request.method !== "GET") return methodNotAllowed();
    const filters = dealFilters(url.searchParams);
    const [origins, destinations, deals] = await Promise.all([
      dependencies.apiRepository.listOrigins(),
      dependencies.apiRepository.listDestinations(destinationFilters(url.searchParams)),
      dependencies.apiRepository.listDeals(filters, now, dependencies.schedulerConfig.revalidateBeforeAlertMinutes)
    ]);
    return htmlResponse(renderDashboardHtml({
      origins,
      destinations,
      deals,
      filters,
      generatedAt: now.toISOString()
    }));
  }

  if (url.pathname === "/api/origins") {
    if (request.method !== "GET") return methodNotAllowed();
    return jsonResponse({ ok: true, origins: await dependencies.apiRepository.listOrigins() });
  }

  if (url.pathname === "/api/destinations") {
    if (request.method !== "GET") return methodNotAllowed();
    return jsonResponse({
      ok: true,
      destinations: await dependencies.apiRepository.listDestinations(destinationFilters(url.searchParams))
    });
  }

  if (url.pathname === "/api/deals") {
    if (request.method !== "GET") return methodNotAllowed();
    return jsonResponse({
      ok: true,
      deals: await dependencies.apiRepository.listDeals(
        dealFilters(url.searchParams),
        now,
        dependencies.schedulerConfig.revalidateBeforeAlertMinutes
      )
    });
  }

  if (url.pathname === "/api/price-history") {
    if (request.method !== "GET") return methodNotAllowed();
    return jsonResponse({
      ok: true,
      price_history: await dependencies.apiRepository.listPriceHistory(priceHistoryFilters(url.searchParams))
    });
  }

  if (url.pathname === "/api/provider-health") {
    if (request.method !== "GET") return methodNotAllowed();
    const healthOptions: { env?: Record<string, string | undefined>; realProviderConfig?: RealProviderConfig } = {};
    if (dependencies.providerReadinessEnv) healthOptions.env = dependencies.providerReadinessEnv;
    if (dependencies.realProviderConfig) healthOptions.realProviderConfig = dependencies.realProviderConfig;
    return jsonResponse({
      ok: true,
      providers: await providerHealthRecords(dependencies.apiRepository, dependencies.providers, healthOptions)
    });
  }

  if (url.pathname === "/api/admin/scan") {
    if (request.method !== "POST") return methodNotAllowed();
    const adminDependencies: AdminScanDependencies = {
      providers: dependencies.providers,
      config: dependencies.schedulerConfig
    };
    if (dependencies.scanRepository) adminDependencies.repository = dependencies.scanRepository;
    if (dependencies.providerReadiness) adminDependencies.providerReadiness = dependencies.providerReadiness;
    if (dependencies.realProviderConfig) adminDependencies.realProviderConfig = dependencies.realProviderConfig;
    if (dependencies.runScan) adminDependencies.runScan = dependencies.runScan;
    return handleAdminScanRequest(request, env, adminDependencies);
  }

  if (url.pathname === "/api/admin/revalidate") {
    if (request.method !== "POST") return methodNotAllowed();
    const authFailure = adminTokenStatus(request, env);
    if (authFailure) return authFailure;
    return jsonResponse({
      ok: false,
      error: "revalidate_not_implemented",
      message: "Targeted revalidation will be implemented after the dashboard/API surface is approved."
    }, 501);
  }

  return notFound();
}

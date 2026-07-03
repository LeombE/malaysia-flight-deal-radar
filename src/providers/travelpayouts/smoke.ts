import { parseCachedProviderConfig } from "../../config/cached-providers.ts";
import { parseTravelpayoutsConfig } from "../../config/travelpayouts.ts";
import type { PriceCalendarApiRecord } from "../../routes/api-types.ts";
import { buildCachedProviderReadinessReports, type ProviderReadinessReport } from "../readiness.ts";
import type { PriceCalendarSearchInput } from "../cached-types.ts";
import { TravelpayoutsProviderError } from "./errors.ts";
import { buildTravelpayoutsUrl, safeQueryKeysForUrl, type TravelpayoutsEndpoint } from "./request-builder.ts";
import { TravelpayoutsProvider } from "./travelpayouts-provider.ts";

export type TravelpayoutsSmokeBlockingReason =
  | "credentials_missing"
  | "cached_provider_disabled"
  | "dry_run_enabled"
  | "provider_not_selected"
  | "unsafe_limit"
  | "unsupported_endpoint"
  | "unsupported_currency"
  | "unsupported_retention_mode"
  | "invalid_smoke_route";

export type TravelpayoutsSmokeErrorClassification =
  | "request_shape_error"
  | "credential_or_access_issue"
  | "rate_limited"
  | "provider_transient_failure"
  | "provider_error";

export interface TravelpayoutsSmokeInput {
  originIata: string;
  destinationIata: string;
  departureAt: string;
  departDate: string;
  returnDate: string;
  endpoint: string;
  currency: string;
  limit: number;
  tripDuration: number;
}

export interface TravelpayoutsSmokeSummary {
  provider: "travelpayouts";
  origin: string;
  destination: string;
  departure_at: string;
  depart_date: string;
  return_date: string;
  trip_duration: number;
  currency: string;
  endpoint: string;
  safe_query_keys: string[];
  limit: number;
  api_call_succeeded: boolean;
  rows_returned: number;
  no_rows_returned: boolean;
  price_myr: string | null;
  original_amount: number | null;
  original_currency: string | null;
  carrier: string | null;
  stops: number | null;
  expires_at: string | null;
  retrieved_at: string | null;
  freshness_label: string | null;
  cache_warning: string;
  diagnostics: string[];
  readiness_status: {
    enabled: boolean;
    can_search_cached: boolean;
    cached_data_source: boolean;
    live_guarantee: boolean;
    blocking_reasons: string[];
  };
}

export interface TravelpayoutsSmokeResult {
  ok: boolean;
  exitCode: 0 | 1;
  route: TravelpayoutsSmokeInput;
  blockingReasons: TravelpayoutsSmokeBlockingReason[];
  readiness: ProviderReadinessReport | null;
  summary: TravelpayoutsSmokeSummary | null;
  errorClassification: TravelpayoutsSmokeErrorClassification | null;
  output: string;
}

export interface TravelpayoutsSmokeOptions {
  env: Record<string, string | undefined>;
  input?: Partial<TravelpayoutsSmokeInput> & { departureDate?: string };
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface TravelpayoutsSmokeStatusRecord {
  provider_name: "travelpayouts";
  status: "blocked" | "failed" | "succeeded" | "no_rows_returned";
  rows_returned: number | null;
  checked_at: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  endpoint: string;
}

const DEFAULT_ENDPOINT: TravelpayoutsEndpoint = "v2/prices/latest";
const SAFE_DEFAULT_LIMIT = 5;
const MAX_SAFE_LIMIT = 10;
const CACHE_WARNING = "Cached/recently found fare only. Recheck before purchase. Not guaranteed live.";

function addDaysIso(nowMs: number, days: number): string {
  return new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10);
}

function normalizeIata(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toUpperCase();
}

function normalizeCurrency(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toUpperCase();
}

function parseInteger(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : fallback;
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEndpoint(value: string | undefined): string {
  const normalized = (value || DEFAULT_ENDPOINT).trim().toLowerCase().replace(/^\/+/, "");
  if (normalized === "latest") return "v2/prices/latest";
  if (normalized === "month-matrix") return "v2/prices/month-matrix";
  if (normalized === "week-matrix") return "v2/prices/week-matrix";
  if (normalized === "v3-prices-for-dates" || normalized === "prices-for-dates" || normalized === "prices_for_dates") {
    return "aviasales/v3/prices_for_dates";
  }
  return normalized;
}

function endpointForSearch(value: string): TravelpayoutsEndpoint | null {
  const endpoint = normalizeEndpoint(value);
  if (
    endpoint === "v2/prices/latest" ||
    endpoint === "v2/prices/month-matrix" ||
    endpoint === "v2/prices/week-matrix" ||
    endpoint === "aviasales/v3/prices_for_dates"
  ) {
    return endpoint;
  }
  return null;
}

function dateFromMonthOrDate(value: string): string {
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
}

export function resolveTravelpayoutsSmokeInput(
  input: TravelpayoutsSmokeOptions["input"],
  env: Record<string, string | undefined>,
  nowMs: number
): TravelpayoutsSmokeInput {
  const defaultDepartDate = addDaysIso(nowMs, 45);
  const rawDepartureAt = input?.departureAt ?? env.TRAVELPAYOUTS_SMOKE_DEPARTURE_AT ?? input?.departureDate ?? input?.departDate ?? env.TRAVELPAYOUTS_SMOKE_DEPARTURE_DATE ?? env.TRAVELPAYOUTS_SMOKE_DEPART_DATE ?? defaultDepartDate;
  const departDate = input?.departDate ?? input?.departureDate ?? env.TRAVELPAYOUTS_SMOKE_DEPART_DATE ?? env.TRAVELPAYOUTS_SMOKE_DEPARTURE_DATE ?? dateFromMonthOrDate(rawDepartureAt);
  const returnDate = input?.returnDate ?? env.TRAVELPAYOUTS_SMOKE_RETURN_DATE ?? addDaysIso(nowMs, 50);
  return {
    originIata: normalizeIata(input?.originIata ?? env.TRAVELPAYOUTS_SMOKE_ORIGIN, "KUL"),
    destinationIata: normalizeIata(input?.destinationIata ?? env.TRAVELPAYOUTS_SMOKE_DESTINATION, "TPE"),
    departureAt: rawDepartureAt,
    departDate,
    returnDate,
    endpoint: normalizeEndpoint(input?.endpoint ?? env.TRAVELPAYOUTS_SMOKE_ENDPOINT),
    currency: normalizeCurrency(input?.currency ?? env.TRAVELPAYOUTS_SMOKE_CURRENCY, "MYR"),
    limit: parseInteger(input?.limit ?? env.TRAVELPAYOUTS_SMOKE_LIMIT, SAFE_DEFAULT_LIMIT),
    tripDuration: parseInteger(input?.tripDuration ?? env.TRAVELPAYOUTS_SMOKE_TRIP_DURATION, 5)
  };
}

function validIata(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function validMonthOrDate(value: string): boolean {
  if (/^\d{4}-\d{2}$/.test(value)) return true;
  return validDate(value);
}

function routeIsValid(input: TravelpayoutsSmokeInput, nowMs: number): boolean {
  if (!validIata(input.originIata) || !validIata(input.destinationIata)) return false;
  if (input.originIata === input.destinationIata) return false;
  if (!validMonthOrDate(input.departureAt) || !validDate(input.departDate) || !validDate(input.returnDate)) return false;
  const departure = Date.parse(`${input.departDate}T00:00:00.000Z`);
  const returning = Date.parse(`${input.returnDate}T00:00:00.000Z`);
  const today = Date.parse(new Date(nowMs).toISOString().slice(0, 10));
  return departure > today && returning > departure;
}

function effectiveTravelpayoutsEnv(
  env: Record<string, string | undefined>,
  route: TravelpayoutsSmokeInput
): Record<string, string | undefined> {
  return {
    ...env,
    TRAVELPAYOUTS_CURRENCY: route.currency
  };
}

function smokeGuards(input: {
  env: Record<string, string | undefined>;
  route: TravelpayoutsSmokeInput;
  nowMs: number;
}): TravelpayoutsSmokeBlockingReason[] {
  const effectiveEnv = effectiveTravelpayoutsEnv(input.env, input.route);
  const cachedConfig = parseCachedProviderConfig(effectiveEnv);
  const travelpayoutsConfig = parseTravelpayoutsConfig(effectiveEnv);
  const reasons: TravelpayoutsSmokeBlockingReason[] = [];

  if (!cachedConfig.enableCachedFareProvider) reasons.push("cached_provider_disabled");
  if (cachedConfig.cachedProviderDryRun) reasons.push("dry_run_enabled");
  if (cachedConfig.defaultCachedProvider !== "travelpayouts") reasons.push("provider_not_selected");
  if (!travelpayoutsConfig.token) reasons.push("credentials_missing");
  if (travelpayoutsConfig.retentionMode === "RAW_ALLOWED") reasons.push("unsupported_retention_mode");
  if (input.route.currency !== "MYR") reasons.push("unsupported_currency");
  if (input.route.limit < 1 || input.route.limit > MAX_SAFE_LIMIT) reasons.push("unsafe_limit");
  if (!endpointForSearch(input.route.endpoint)) reasons.push("unsupported_endpoint");
  if (!routeIsValid(input.route, input.nowMs)) reasons.push("invalid_smoke_route");

  return [...new Set(reasons)];
}

function readinessForTravelpayouts(input: {
  env: Record<string, string | undefined>;
  provider: TravelpayoutsProvider;
}): ProviderReadinessReport | null {
  const reports = buildCachedProviderReadinessReports({
    providers: [input.provider],
    env: input.env,
    config: parseCachedProviderConfig(input.env)
  });
  return reports[0] ?? null;
}

function readinessStatus(readiness: ProviderReadinessReport | null): TravelpayoutsSmokeSummary["readiness_status"] {
  return {
    enabled: readiness?.enabled ?? false,
    can_search_cached: readiness?.can_search_cached ?? false,
    cached_data_source: readiness?.cached_data_source ?? true,
    live_guarantee: readiness?.live_guarantee ?? false,
    blocking_reasons: readiness?.blocking_reasons ?? []
  };
}

function noRowsDiagnostics(): string[] {
  return [
    "API call succeeded.",
    "No cached fare rows returned.",
    "This is usually a Travelpayouts cached-data route/date availability issue, not a credential failure.",
    "Try a different future date window or endpoint, then recheck before purchase."
  ];
}

function searchInputForEndpoint(route: TravelpayoutsSmokeInput, endpoint: TravelpayoutsEndpoint): PriceCalendarSearchInput {
  const departureFrom = endpoint === "v2/prices/week-matrix" ? route.departDate : route.departureAt;
  return {
    originIata: route.originIata,
    destinationIata: route.destinationIata,
    departureFrom,
    departureTo: departureFrom,
    returnFrom: route.returnDate,
    returnTo: route.returnDate,
    stayLengthDays: route.tripDuration,
    adults: 1,
    cabinClass: "economy",
    limit: route.limit
  };
}

function safeQueryKeys(input: {
  route: TravelpayoutsSmokeInput;
  endpoint: TravelpayoutsEndpoint;
  env: Record<string, string | undefined>;
}): string[] {
  const config = parseTravelpayoutsConfig(effectiveTravelpayoutsEnv(input.env, input.route));
  return safeQueryKeysForUrl(buildTravelpayoutsUrl(config, input.endpoint, searchInputForEndpoint(input.route, input.endpoint)));
}

function summaryForRows(input: {
  route: TravelpayoutsSmokeInput;
  endpoint: TravelpayoutsEndpoint;
  rows: readonly PriceCalendarApiRecord[];
  readiness: ProviderReadinessReport | null;
  env: Record<string, string | undefined>;
}): TravelpayoutsSmokeSummary {
  const first = input.rows[0] ?? null;
  return {
    provider: "travelpayouts",
    origin: input.route.originIata,
    destination: input.route.destinationIata,
    departure_at: input.route.departureAt,
    depart_date: input.route.departDate,
    return_date: input.route.returnDate,
    trip_duration: input.route.tripDuration,
    currency: input.route.currency,
    endpoint: input.route.endpoint,
    safe_query_keys: safeQueryKeys({ route: input.route, endpoint: input.endpoint, env: input.env }),
    limit: input.route.limit,
    api_call_succeeded: true,
    rows_returned: input.rows.length,
    no_rows_returned: input.rows.length === 0,
    price_myr: first?.amount_minor_myr === null ? null : first?.display_price_rm ?? null,
    original_amount: first?.original_amount ?? null,
    original_currency: first?.original_currency ?? null,
    carrier: first?.airline_iata ?? null,
    stops: first?.stops ?? null,
    expires_at: first?.expires_at ?? null,
    retrieved_at: first?.retrieved_at ?? null,
    freshness_label: first?.freshness_label ?? null,
    cache_warning: first?.warning ?? CACHE_WARNING,
    diagnostics: input.rows.length === 0 ? noRowsDiagnostics() : [],
    readiness_status: readinessStatus(input.readiness)
  };
}

function formatBlocked(
  reasons: readonly TravelpayoutsSmokeBlockingReason[],
  readiness: ProviderReadinessReport | null,
  route: TravelpayoutsSmokeInput
): string {
  return [
    "Travelpayouts smoke blocked.",
    `Route: ${route.originIata}-${route.destinationIata} ${route.departDate} to ${route.returnDate}`,
    `Endpoint: ${route.endpoint}, departure_at=${route.departureAt}, currency=${route.currency}, limit=${route.limit}`,
    "Blocking reasons:",
    ...reasons.map((reason) => `- ${reason}`),
    `Readiness: enabled=${readiness?.enabled ?? false}, can_search_cached=${readiness?.can_search_cached ?? false}, cached_data_source=true, live_guarantee=false`,
    "No Travelpayouts network call was made."
  ].join("\n");
}

function formatSummary(summary: TravelpayoutsSmokeSummary): string {
  const lines = [
    "Travelpayouts smoke complete.",
    JSON.stringify(summary, null, 2)
  ];
  if (summary.no_rows_returned) {
    lines.push("Diagnostics:");
    lines.push(...summary.diagnostics.map((message) => `- ${message}`));
  }
  return lines.join("\n");
}

function sanitizeMessage(message: string, env: Record<string, string | undefined>): string {
  const token = env.TRAVELPAYOUTS_TOKEN;
  return token ? message.replaceAll(token, "[redacted]") : message;
}

function classifyError(error: unknown): TravelpayoutsSmokeErrorClassification {
  if (error instanceof TravelpayoutsProviderError) {
    if (error.status === 400) return "request_shape_error";
    if (error.status === 401 || error.status === 403) return "credential_or_access_issue";
    if (error.status === 429) return "rate_limited";
    if (error.status && error.status >= 500) return "provider_transient_failure";
  }
  return "provider_error";
}

function formatFailure(
  classification: TravelpayoutsSmokeErrorClassification,
  message: string,
  readiness: ProviderReadinessReport | null,
  route: TravelpayoutsSmokeInput
): string {
  return [
    "Travelpayouts smoke failed.",
    `Route: ${route.originIata}-${route.destinationIata} ${route.departDate} to ${route.returnDate}`,
    `Endpoint: ${route.endpoint}, departure_at=${route.departureAt}, currency=${route.currency}, limit=${route.limit}`,
    `Error classification: ${classification}`,
    `Readiness: enabled=${readiness?.enabled ?? false}, can_search_cached=${readiness?.can_search_cached ?? false}, cached_data_source=true, live_guarantee=false`,
    `Error: ${message}`
  ].join("\n");
}

export function travelpayoutsSmokeStatusFromResult(
  result: TravelpayoutsSmokeResult,
  checkedAt: string
): TravelpayoutsSmokeStatusRecord {
  return {
    provider_name: "travelpayouts",
    status: result.ok
      ? (result.summary?.rows_returned === 0 ? "no_rows_returned" : "succeeded")
      : (result.blockingReasons.length > 0 ? "blocked" : "failed"),
    rows_returned: result.summary?.rows_returned ?? null,
    checked_at: checkedAt,
    origin: result.route.originIata,
    destination: result.route.destinationIata,
    departure_date: result.route.departDate,
    return_date: result.route.returnDate,
    endpoint: result.route.endpoint
  };
}

export async function runTravelpayoutsSmoke(options: TravelpayoutsSmokeOptions): Promise<TravelpayoutsSmokeResult> {
  const now = options.now ?? Date.now;
  const nowMs = now();
  const route = resolveTravelpayoutsSmokeInput(options.input, options.env, nowMs);
  const effectiveEnv = effectiveTravelpayoutsEnv(options.env, route);
  const providerDeps: { fetch?: typeof fetch; now: () => number; sleep?: (ms: number) => Promise<void> } = { now };
  if (options.fetch) providerDeps.fetch = options.fetch;
  if (options.sleep) providerDeps.sleep = options.sleep;
  const provider = new TravelpayoutsProvider(
    parseTravelpayoutsConfig(effectiveEnv),
    parseCachedProviderConfig(effectiveEnv),
    providerDeps
  );
  const readiness = readinessForTravelpayouts({ env: effectiveEnv, provider });
  const blockingReasons = smokeGuards({ env: options.env, route, nowMs });

  if (blockingReasons.length > 0) {
    return {
      ok: false,
      exitCode: 1,
      route,
      blockingReasons,
      readiness,
      summary: null,
      errorClassification: null,
      output: formatBlocked(blockingReasons, readiness, route)
    };
  }

  try {
    const endpoint = endpointForSearch(route.endpoint);
    if (!endpoint) throw new Error("Unsupported Travelpayouts smoke endpoint");
    const searchInput = searchInputForEndpoint(route, endpoint);
    const rows = endpoint === "v2/prices/latest"
      ? await provider.searchLatest(searchInput)
      : endpoint === "v2/prices/month-matrix"
        ? await provider.searchMonthMatrix(searchInput)
        : endpoint === "v2/prices/week-matrix"
          ? await provider.searchWeekMatrix(searchInput)
          : await provider.searchV3PricesForDates(searchInput);
    const summary = summaryForRows({ route, endpoint, rows, readiness, env: options.env });
    return {
      ok: true,
      exitCode: 0,
      route,
      blockingReasons: [],
      readiness,
      summary,
      errorClassification: null,
      output: formatSummary(summary)
    };
  } catch (error) {
    const classification = classifyError(error);
    const message = sanitizeMessage(
      error instanceof Error ? error.message : "Unknown Travelpayouts smoke failure",
      options.env
    );
    return {
      ok: false,
      exitCode: 1,
      route,
      blockingReasons: [],
      readiness,
      summary: null,
      errorClassification: classification,
      output: formatFailure(classification, message, readiness, route)
    };
  }
}

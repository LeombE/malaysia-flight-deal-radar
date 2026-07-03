import { parseCachedProviderConfig } from "../../config/cached-providers.ts";
import { parseTravelpayoutsConfig } from "../../config/travelpayouts.ts";
import type { PriceCalendarApiRecord } from "../../routes/api-types.ts";
import type { PriceCalendarSearchInput } from "../cached-types.ts";
import { TravelpayoutsProvider } from "./travelpayouts-provider.ts";
import { buildTravelpayoutsUrl, safeQueryKeysForUrl, type TravelpayoutsEndpoint } from "./request-builder.ts";

export type TravelpayoutsImportEndpoint = "v2/prices/latest" | "v2/prices/month-matrix" | "v2/prices/week-matrix";

export type TravelpayoutsImportBlockingReason =
  | "credentials_missing"
  | "cached_provider_disabled"
  | "dry_run_enabled"
  | "provider_not_selected"
  | "target_not_local"
  | "unsafe_limit"
  | "unsupported_endpoint"
  | "unsupported_destination"
  | "unsupported_currency"
  | "unsupported_retention_mode"
  | "invalid_import_route";

export interface TravelpayoutsImportInput {
  target?: string;
  dryRunImport?: boolean | string;
  originIata?: string;
  destinationIata?: string;
  endpoint?: string;
  currency?: string;
  departDate?: string;
  returnDate?: string;
  periodType?: "year" | "month" | string;
  tripDuration?: number | string;
  limit?: number | string;
}

export interface ResolvedTravelpayoutsImportInput {
  target: string;
  dryRunImport: boolean;
  originIata: string;
  destinationIata: string;
  endpoint: TravelpayoutsImportEndpoint | string;
  currency: string;
  departDate: string;
  returnDate: string;
  periodType: "year" | "month";
  tripDuration: number;
  limit: number;
}

export interface TravelpayoutsImportSummaryRow {
  id: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  price_myr: string;
  original_currency: string;
  carrier: string | null;
  flight_number: string | null;
  stops: number | null;
  freshness_label: string;
  warning: string;
}

export interface TravelpayoutsImportSummary {
  provider: "travelpayouts";
  target: "local";
  dry_run_import: boolean;
  origin: string;
  destination: string;
  endpoint: string;
  depart_date: string;
  return_date: string;
  trip_duration: number;
  currency: string;
  safe_query_keys: string[];
  rows_fetched: number;
  rows_planned: number;
  rows_imported: number;
  rows_skipped: number;
  rows: TravelpayoutsImportSummaryRow[];
  cache_warning: string;
}

export interface TravelpayoutsImportResult {
  ok: boolean;
  exitCode: 0 | 1;
  input: ResolvedTravelpayoutsImportInput;
  blockingReasons: TravelpayoutsImportBlockingReason[];
  summary: TravelpayoutsImportSummary | null;
  sql: string | null;
  output: string;
}

export interface TravelpayoutsImportOptions {
  env: Record<string, string | undefined>;
  input?: TravelpayoutsImportInput;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  executeSql?: (sql: string) => Promise<unknown>;
}

const DEFAULT_INPUT: ResolvedTravelpayoutsImportInput = {
  target: "local",
  dryRunImport: false,
  originIata: "KUL",
  destinationIata: "BKK",
  endpoint: "v2/prices/week-matrix",
  currency: "MYR",
  departDate: "2026-08-17",
  returnDate: "2026-08-22",
  periodType: "month",
  tripDuration: 5,
  limit: 5
};

const ALLOWED_DESTINATIONS = new Set(["BKK", "TPE", "DPS", "SIN"]);
const MAX_IMPORT_LIMIT = 10;
const CACHE_WARNING = "Cached fare from recent searches. Recheck before purchase. Not guaranteed live. Price may have changed.";
const IMPORT_COLUMNS = [
  "id",
  "origin_iata",
  "destination_iata",
  "destination_country",
  "destination_region",
  "departure_date",
  "return_date",
  "stay_length_days",
  "trip_type",
  "cabin_class",
  "adults",
  "amount_minor_myr",
  "original_amount",
  "original_currency",
  "airline_iata",
  "flight_number",
  "stops",
  "total_duration_minutes",
  "provider_name",
  "source_endpoint",
  "retrieved_at",
  "expires_at",
  "freshness_label",
  "is_live",
  "is_bookable_claim",
  "search_link",
  "warning",
  "retention_mode"
] as const;

function normalizeIata(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toUpperCase();
}

function normalizeCurrency(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toUpperCase();
}

function parseInteger(value: number | string | undefined, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : fallback;
  if (!value) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeEndpoint(value: string | undefined): string {
  const normalized = (value || DEFAULT_INPUT.endpoint).trim().toLowerCase().replace(/^\/+/, "");
  if (normalized === "latest") return "v2/prices/latest";
  if (normalized === "month-matrix") return "v2/prices/month-matrix";
  if (normalized === "week-matrix") return "v2/prices/week-matrix";
  return normalized;
}

function endpointForImport(value: string): TravelpayoutsImportEndpoint | null {
  const endpoint = normalizeEndpoint(value);
  if (endpoint === "v2/prices/latest" || endpoint === "v2/prices/month-matrix" || endpoint === "v2/prices/week-matrix") {
    return endpoint;
  }
  return null;
}

function normalizePeriodType(value: string | undefined): "year" | "month" {
  const normalized = value?.trim().toLowerCase();
  return normalized === "year" ? "year" : "month";
}

function validIata(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function routeIsValid(input: ResolvedTravelpayoutsImportInput): boolean {
  if (!validIata(input.originIata) || !validIata(input.destinationIata)) return false;
  if (input.originIata === input.destinationIata) return false;
  if (!validDate(input.departDate) || !validDate(input.returnDate)) return false;
  return Date.parse(`${input.returnDate}T00:00:00.000Z`) > Date.parse(`${input.departDate}T00:00:00.000Z`);
}

export function resolveTravelpayoutsImportInput(
  input: TravelpayoutsImportInput | undefined,
  env: Record<string, string | undefined>
): ResolvedTravelpayoutsImportInput {
  return {
    target: (input?.target ?? env.TRAVELPAYOUTS_IMPORT_TARGET ?? DEFAULT_INPUT.target).trim().toLowerCase(),
    dryRunImport: parseBoolean(input?.dryRunImport ?? env.TRAVELPAYOUTS_IMPORT_DRY_RUN, DEFAULT_INPUT.dryRunImport),
    originIata: normalizeIata(input?.originIata ?? env.TRAVELPAYOUTS_IMPORT_ORIGIN, DEFAULT_INPUT.originIata),
    destinationIata: normalizeIata(input?.destinationIata ?? env.TRAVELPAYOUTS_IMPORT_DESTINATION, DEFAULT_INPUT.destinationIata),
    endpoint: normalizeEndpoint(input?.endpoint ?? env.TRAVELPAYOUTS_IMPORT_ENDPOINT),
    currency: normalizeCurrency(input?.currency ?? env.TRAVELPAYOUTS_IMPORT_CURRENCY, DEFAULT_INPUT.currency),
    departDate: (input?.departDate ?? env.TRAVELPAYOUTS_IMPORT_DEPART_DATE ?? DEFAULT_INPUT.departDate).trim(),
    returnDate: (input?.returnDate ?? env.TRAVELPAYOUTS_IMPORT_RETURN_DATE ?? DEFAULT_INPUT.returnDate).trim(),
    periodType: normalizePeriodType(input?.periodType ?? env.TRAVELPAYOUTS_IMPORT_PERIOD_TYPE),
    tripDuration: parseInteger(input?.tripDuration ?? env.TRAVELPAYOUTS_IMPORT_TRIP_DURATION, DEFAULT_INPUT.tripDuration),
    limit: parseInteger(input?.limit ?? env.TRAVELPAYOUTS_IMPORT_LIMIT, DEFAULT_INPUT.limit)
  };
}

function effectiveEnv(env: Record<string, string | undefined>, input: ResolvedTravelpayoutsImportInput): Record<string, string | undefined> {
  return {
    ...env,
    TRAVELPAYOUTS_CURRENCY: input.currency
  };
}

function importGuards(input: {
  env: Record<string, string | undefined>;
  route: ResolvedTravelpayoutsImportInput;
}): TravelpayoutsImportBlockingReason[] {
  const env = effectiveEnv(input.env, input.route);
  const cachedConfig = parseCachedProviderConfig(env);
  const travelpayoutsConfig = parseTravelpayoutsConfig(env);
  const reasons: TravelpayoutsImportBlockingReason[] = [];

  if (!cachedConfig.enableCachedFareProvider) reasons.push("cached_provider_disabled");
  if (cachedConfig.cachedProviderDryRun) reasons.push("dry_run_enabled");
  if (cachedConfig.defaultCachedProvider !== "travelpayouts") reasons.push("provider_not_selected");
  if (!travelpayoutsConfig.token) reasons.push("credentials_missing");
  if (travelpayoutsConfig.retentionMode !== "AGGREGATE_ONLY") reasons.push("unsupported_retention_mode");
  if (input.route.target !== "local") reasons.push("target_not_local");
  if (input.route.currency !== "MYR") reasons.push("unsupported_currency");
  if (!ALLOWED_DESTINATIONS.has(input.route.destinationIata)) reasons.push("unsupported_destination");
  if (input.route.limit < 1 || input.route.limit > MAX_IMPORT_LIMIT) reasons.push("unsafe_limit");
  if (!endpointForImport(input.route.endpoint)) reasons.push("unsupported_endpoint");
  if (!routeIsValid(input.route)) reasons.push("invalid_import_route");

  return [...new Set(reasons)];
}

function searchInputForEndpoint(route: ResolvedTravelpayoutsImportInput, endpoint: TravelpayoutsImportEndpoint): PriceCalendarSearchInput {
  const search: PriceCalendarSearchInput = {
    originIata: route.originIata,
    destinationIata: route.destinationIata,
    departureFrom: route.departDate,
    departureTo: route.departDate,
    returnFrom: route.returnDate,
    returnTo: route.returnDate,
    stayLengthDays: route.tripDuration,
    adults: 1,
    cabinClass: "economy",
    limit: route.limit,
    periodType: route.periodType
  };
  if (endpoint === "v2/prices/week-matrix") return search;
  return search;
}

function safeQueryKeys(input: {
  env: Record<string, string | undefined>;
  route: ResolvedTravelpayoutsImportInput;
  endpoint: TravelpayoutsImportEndpoint;
}): string[] {
  const config = parseTravelpayoutsConfig(effectiveEnv(input.env, input.route));
  const search = searchInputForEndpoint(input.route, input.endpoint);
  return safeQueryKeysForUrl(buildTravelpayoutsUrl(config, input.endpoint, search));
}

function normalizeWarning(value: string): string {
  const warning = value || CACHE_WARNING;
  return /cached/i.test(warning) && /recheck/i.test(warning) ? warning : `${warning} ${CACHE_WARNING}`.trim();
}

function valuePart(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function stableTravelpayoutsCalendarDedupeKey(row: PriceCalendarApiRecord): string {
  return [
    "travelpayouts",
    row.source_endpoint,
    row.origin_iata,
    row.destination_iata,
    row.departure_date,
    row.return_date,
    row.stay_length_days,
    row.amount_minor_myr,
    row.original_currency,
    row.airline_iata,
    row.flight_number,
    row.stops
  ].map(valuePart).join("|");
}

function stableHash(value: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b1, 0x85ebca77, 0xc2b2ae3d];
  return seeds.map((seed) => {
    let hash = seed;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }).join("");
}

export function stableTravelpayoutsCalendarId(row: PriceCalendarApiRecord): string {
  return `travelpayouts-${stableHash(stableTravelpayoutsCalendarDedupeKey(row))}`;
}

function sqlLiteral(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${value.replaceAll("'", "''")}'`;
}

function rowValues(row: PriceCalendarApiRecord): Array<string | number | null> {
  return [
    stableTravelpayoutsCalendarId(row),
    row.origin_iata,
    row.destination_iata,
    row.destination_country,
    row.destination_region,
    row.departure_date,
    row.return_date,
    row.stay_length_days,
    "round_trip",
    "economy",
    1,
    row.amount_minor_myr,
    row.original_amount,
    row.original_currency,
    row.airline_iata,
    row.flight_number,
    row.stops,
    row.total_duration_minutes,
    "travelpayouts",
    row.source_endpoint,
    row.retrieved_at,
    row.expires_at,
    row.freshness_label,
    0,
    0,
    row.search_link,
    normalizeWarning(row.warning),
    "AGGREGATE_ONLY"
  ];
}

function rowIsImportable(row: PriceCalendarApiRecord): boolean {
  return row.provider_name === "travelpayouts" &&
    row.original_currency === "MYR" &&
    row.amount_minor_myr !== null &&
    row.amount_minor_myr > 0 &&
    row.trip_type === "round_trip" &&
    row.cabin_class === "economy" &&
    row.adults === 1;
}

export function buildTravelpayoutsPriceCalendarUpsertSql(rows: readonly PriceCalendarApiRecord[]): string {
  const importable = rows.filter(rowIsImportable);
  if (importable.length === 0) return "";
  return importable.map((row) => {
    const values = rowValues(row).map(sqlLiteral).join(", ");
    return [
      `INSERT INTO price_calendar_rows (${IMPORT_COLUMNS.join(", ")})`,
      `VALUES (${values})`,
      "ON CONFLICT(id) DO UPDATE SET",
      "  retrieved_at = excluded.retrieved_at,",
      "  expires_at = excluded.expires_at,",
      "  freshness_label = excluded.freshness_label,",
      "  warning = excluded.warning,",
      "  search_link = excluded.search_link,",
      "  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');"
    ].join("\n");
  }).join("\n\n");
}

export function buildTravelpayoutsImportVerifySql(): string {
  return [
    "SELECT provider_name, COUNT(*) AS row_count FROM price_calendar_rows GROUP BY provider_name ORDER BY provider_name;",
    "SELECT freshness_label, COUNT(*) AS row_count FROM price_calendar_rows GROUP BY freshness_label ORDER BY freshness_label;",
    "SELECT origin_iata, destination_iata, departure_date, return_date, stay_length_days, amount_minor_myr, original_currency, airline_iata, flight_number, stops, retrieved_at FROM price_calendar_rows WHERE provider_name = 'travelpayouts' AND origin_iata = 'KUL' ORDER BY CASE WHEN amount_minor_myr IS NULL THEN 1 ELSE 0 END, amount_minor_myr ASC, departure_date ASC LIMIT 10;",
    "SELECT name FROM pragma_table_info('price_calendar_rows') WHERE lower(name) LIKE '%raw%' OR lower(name) LIKE '%payload%' OR lower(name) LIKE '%token%';"
  ].join("\n");
}

function summaryRow(row: PriceCalendarApiRecord): TravelpayoutsImportSummaryRow {
  return {
    id: stableTravelpayoutsCalendarId(row),
    origin: row.origin_iata,
    destination: row.destination_iata,
    departure_date: row.departure_date,
    return_date: row.return_date,
    price_myr: row.display_price_rm,
    original_currency: row.original_currency,
    carrier: row.airline_iata,
    flight_number: row.flight_number,
    stops: row.stops,
    freshness_label: row.freshness_label,
    warning: normalizeWarning(row.warning)
  };
}

function buildSummary(input: {
  route: ResolvedTravelpayoutsImportInput;
  endpoint: TravelpayoutsImportEndpoint;
  rows: readonly PriceCalendarApiRecord[];
  importableRows: readonly PriceCalendarApiRecord[];
  env: Record<string, string | undefined>;
  executed: boolean;
}): TravelpayoutsImportSummary {
  return {
    provider: "travelpayouts",
    target: "local",
    dry_run_import: input.route.dryRunImport,
    origin: input.route.originIata,
    destination: input.route.destinationIata,
    endpoint: input.endpoint,
    depart_date: input.route.departDate,
    return_date: input.route.returnDate,
    trip_duration: input.route.tripDuration,
    currency: input.route.currency,
    safe_query_keys: safeQueryKeys({ env: input.env, route: input.route, endpoint: input.endpoint }),
    rows_fetched: input.rows.length,
    rows_planned: input.importableRows.length,
    rows_imported: input.executed ? input.importableRows.length : 0,
    rows_skipped: input.rows.length - input.importableRows.length,
    rows: input.importableRows.slice(0, 5).map(summaryRow),
    cache_warning: CACHE_WARNING
  };
}

function formatBlocked(route: ResolvedTravelpayoutsImportInput, reasons: readonly TravelpayoutsImportBlockingReason[]): string {
  return [
    "Travelpayouts local import blocked.",
    `Target: ${route.target}`,
    `Route: ${route.originIata}-${route.destinationIata} ${route.departDate} to ${route.returnDate}`,
    `Endpoint: ${route.endpoint}, period_type=${route.periodType}, currency=${route.currency}, limit=${route.limit}`,
    "Blocking reasons:",
    ...reasons.map((reason) => `- ${reason}`),
    "No Travelpayouts network call was made.",
    "No D1 import was executed."
  ].join("\n");
}

function formatSummary(summary: TravelpayoutsImportSummary): string {
  const lines = [
    "Travelpayouts local import complete.",
    JSON.stringify(summary, null, 2)
  ];
  if (summary.rows_fetched === 0) {
    lines.push("API call succeeded with zero cached fare rows. This is not a credential failure.");
  }
  if (summary.dry_run_import) {
    lines.push("Dry-run import only. No local D1 write was executed.");
  }
  return lines.join("\n");
}

function sanitizeOutput(message: string, env: Record<string, string | undefined>): string {
  const token = env.TRAVELPAYOUTS_TOKEN;
  return token ? message.replaceAll(token, "[redacted]") : message;
}

export async function runTravelpayoutsImportLocal(options: TravelpayoutsImportOptions): Promise<TravelpayoutsImportResult> {
  const now = options.now ?? Date.now;
  const route = resolveTravelpayoutsImportInput(options.input, options.env);
  const endpoint = endpointForImport(route.endpoint);
  const blockingReasons = importGuards({ env: options.env, route });

  if (blockingReasons.length > 0) {
    return {
      ok: false,
      exitCode: 1,
      input: route,
      blockingReasons,
      summary: null,
      sql: null,
      output: formatBlocked(route, blockingReasons)
    };
  }

  if (!endpoint) {
    return {
      ok: false,
      exitCode: 1,
      input: route,
      blockingReasons: ["unsupported_endpoint"],
      summary: null,
      sql: null,
      output: formatBlocked(route, ["unsupported_endpoint"])
    };
  }

  try {
    const env = effectiveEnv(options.env, route);
    const providerDeps: { fetch?: typeof fetch; now: () => number; sleep?: (ms: number) => Promise<void> } = { now };
    if (options.fetch) providerDeps.fetch = options.fetch;
    if (options.sleep) providerDeps.sleep = options.sleep;
    const provider = new TravelpayoutsProvider(
      parseTravelpayoutsConfig(env),
      parseCachedProviderConfig(env),
      providerDeps
    );
    const search = searchInputForEndpoint(route, endpoint);
    const rows = endpoint === "v2/prices/latest"
      ? await provider.searchLatest(search)
      : endpoint === "v2/prices/month-matrix"
        ? await provider.searchMonthMatrix(search)
        : await provider.searchWeekMatrix(search);
    const importableRows = rows.filter(rowIsImportable);
    const sql = buildTravelpayoutsPriceCalendarUpsertSql(importableRows);
    const shouldExecute = !route.dryRunImport && sql.length > 0;
    let executed = false;
    if (shouldExecute) {
      if (!options.executeSql) throw new Error("Local D1 SQL executor is required for non-dry-run import");
      await options.executeSql(sql);
      executed = true;
    }
    const summary = buildSummary({ route, endpoint, rows, importableRows, env: options.env, executed });
    return {
      ok: true,
      exitCode: 0,
      input: route,
      blockingReasons: [],
      summary,
      sql,
      output: sanitizeOutput(formatSummary(summary), options.env)
    };
  } catch (error) {
    const message = sanitizeOutput(error instanceof Error ? error.message : "Unknown Travelpayouts local import failure", options.env);
    return {
      ok: false,
      exitCode: 1,
      input: route,
      blockingReasons: [],
      summary: null,
      sql: null,
      output: [
        "Travelpayouts local import failed.",
        `Route: ${route.originIata}-${route.destinationIata} ${route.departDate} to ${route.returnDate}`,
        `Endpoint: ${route.endpoint}, currency=${route.currency}, limit=${route.limit}`,
        `Error: ${message}`
      ].join("\n")
    };
  }
}

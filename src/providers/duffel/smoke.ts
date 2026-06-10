import { parseDuffelConfig } from "../../config/duffel.ts";
import { parseRealProviderConfig } from "../../config/real-providers.ts";
import { formatMyrFromMinor } from "../../scoring/statistics.ts";
import { buildProviderReadinessReports, type ProviderReadinessReport } from "../readiness.ts";
import type { ProviderOffer, SearchRoundTripInput } from "../types.ts";
import { DuffelProvider } from "./duffel-provider.ts";

export type DuffelSmokeProfile = "default" | "duffel-airways";

export type DuffelSmokeBlockingReason =
  | "credentials_missing"
  | "real_providers_disabled"
  | "dry_run_enabled"
  | "provider_not_selected"
  | "non_test_token"
  | "unsafe_search_limit"
  | "unsafe_daily_budget"
  | "unsupported_currency"
  | "unsupported_retention_mode"
  | "unsupported_cabin_class"
  | "unsupported_adult_count"
  | "invalid_smoke_route";

export interface DuffelSmokeInput {
  profile: DuffelSmokeProfile;
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  cabinClass: string;
  adults: number;
  currency: string;
}

export interface DuffelSmokeSummary {
  provider: "duffel";
  profile: DuffelSmokeProfile;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  cabin: string;
  adults: number;
  currency: string;
  api_call_succeeded: boolean;
  offers_returned: number;
  no_offers_returned: boolean;
  price_myr: string | null;
  carrier: string | null;
  stops: number | null;
  duration_minutes: number | null;
  expires_at: string | null;
  last_revalidated_at: string | null;
  diagnostics: string[];
  readiness_status: {
    enabled: boolean;
    can_search_live: boolean;
    can_revalidate_live: boolean;
    blocking_reasons: string[];
  };
}

export interface DuffelSmokeResult {
  ok: boolean;
  exitCode: 0 | 1;
  blockingReasons: DuffelSmokeBlockingReason[];
  readiness: ProviderReadinessReport | null;
  summary: DuffelSmokeSummary | null;
  output: string;
}

export interface DuffelSmokeOptions {
  env: Record<string, string | undefined>;
  input?: Partial<DuffelSmokeInput>;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface DuffelSmokeStatusRecord {
  provider_name: "duffel";
  status: "blocked" | "failed" | "succeeded" | "no_offers_returned";
  offers_returned: number | null;
  checked_at: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
}

const DUFFEL_AIRWAYS_PROFILE = {
  originIata: "LHR",
  destinationIata: "JFK",
  cabinClass: "economy",
  adults: 1,
  currency: "MYR"
} as const;

function addDaysIso(nowMs: number, days: number): string {
  return new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10);
}

function normalizeIata(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toUpperCase();
}

function normalizeCurrency(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toUpperCase();
}

function normalizeCabin(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toLowerCase();
}

function parseAdults(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : fallback;
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeProfile(value: string | undefined): DuffelSmokeProfile {
  return value?.trim().toLowerCase() === "duffel-airways" ? "duffel-airways" : "default";
}

export function resolveDuffelSmokeInput(
  input: Partial<DuffelSmokeInput> | undefined,
  env: Record<string, string | undefined>,
  nowMs: number
): DuffelSmokeInput {
  const profile = input?.profile ?? normalizeProfile(env.DUFFEL_SMOKE_PROFILE);
  const profileDefaults = profile === "duffel-airways"
    ? DUFFEL_AIRWAYS_PROFILE
    : {
        originIata: "KUL",
        destinationIata: "SIN",
        cabinClass: "economy",
        adults: 1,
        currency: "MYR"
      };

  return {
    profile,
    originIata: normalizeIata(input?.originIata ?? env.DUFFEL_SMOKE_ORIGIN, profileDefaults.originIata),
    destinationIata: normalizeIata(input?.destinationIata ?? env.DUFFEL_SMOKE_DESTINATION, profileDefaults.destinationIata),
    departureDate: input?.departureDate ?? env.DUFFEL_SMOKE_DEPARTURE_DATE ?? addDaysIso(nowMs, 90),
    returnDate: input?.returnDate ?? env.DUFFEL_SMOKE_RETURN_DATE ?? addDaysIso(nowMs, 95),
    cabinClass: normalizeCabin(input?.cabinClass ?? env.DUFFEL_SMOKE_CABIN_CLASS, profileDefaults.cabinClass),
    adults: parseAdults(input?.adults ?? env.DUFFEL_SMOKE_ADULTS, profileDefaults.adults),
    currency: normalizeCurrency(input?.currency ?? env.DUFFEL_SMOKE_CURRENCY, profileDefaults.currency)
  };
}

function validIata(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed);
}

function routeIsValid(input: DuffelSmokeInput, nowMs: number): boolean {
  if (!validIata(input.originIata) || !validIata(input.destinationIata)) return false;
  if (input.originIata === input.destinationIata) return false;
  if (!validDate(input.departureDate) || !validDate(input.returnDate)) return false;
  const departure = Date.parse(`${input.departureDate}T00:00:00.000Z`);
  const returning = Date.parse(`${input.returnDate}T00:00:00.000Z`);
  const today = Date.parse(new Date(nowMs).toISOString().slice(0, 10));
  return departure > today && returning > departure;
}

function effectiveDuffelEnv(env: Record<string, string | undefined>, route: DuffelSmokeInput): Record<string, string | undefined> {
  return {
    ...env,
    DUFFEL_CURRENCY_CODE: route.currency
  };
}

function smokeGuards(input: {
  env: Record<string, string | undefined>;
  route: DuffelSmokeInput;
  nowMs: number;
}): DuffelSmokeBlockingReason[] {
  const effectiveEnv = effectiveDuffelEnv(input.env, input.route);
  const realConfig = parseRealProviderConfig(effectiveEnv);
  const duffelConfig = parseDuffelConfig(effectiveEnv);
  const reasons: DuffelSmokeBlockingReason[] = [];

  if (!realConfig.enableRealProviders) reasons.push("real_providers_disabled");
  if (realConfig.realProviderDryRun) reasons.push("dry_run_enabled");
  if (realConfig.defaultRealProvider !== "duffel") reasons.push("provider_not_selected");
  if (!duffelConfig.accessToken) reasons.push("credentials_missing");
  else if (!duffelConfig.testModeDetected) reasons.push("non_test_token");
  if (realConfig.maxRealProviderSearchesPerRun !== 1) reasons.push("unsafe_search_limit");
  if (realConfig.maxRealProviderDailyBudget < 1 || realConfig.maxRealProviderDailyBudget > 3) {
    reasons.push("unsafe_daily_budget");
  }
  if (duffelConfig.currencyCode !== "MYR") reasons.push("unsupported_currency");
  if (duffelConfig.retentionMode !== "NO_CACHE") reasons.push("unsupported_retention_mode");
  if (input.route.cabinClass !== "economy") reasons.push("unsupported_cabin_class");
  if (!Number.isInteger(input.route.adults) || input.route.adults < 1 || input.route.adults > 4) {
    reasons.push("unsupported_adult_count");
  }
  if (!routeIsValid(input.route, input.nowMs)) reasons.push("invalid_smoke_route");

  return [...new Set(reasons)];
}

function readinessForDuffel(input: {
  env: Record<string, string | undefined>;
  provider: DuffelProvider;
  route: DuffelSmokeInput;
}): ProviderReadinessReport | null {
  const effectiveEnv = effectiveDuffelEnv(input.env, input.route);
  const realConfig = parseRealProviderConfig(effectiveEnv);
  const reports = buildProviderReadinessReports({
    providers: [input.provider],
    env: effectiveEnv,
    config: realConfig,
    providerLimits: [{
      providerName: "duffel",
      dailyBudget: realConfig.maxRealProviderDailyBudget,
      usedToday: 0
    }]
  });
  return reports[0] ?? null;
}

function readinessStatus(readiness: ProviderReadinessReport | null): DuffelSmokeSummary["readiness_status"] {
  return {
    enabled: readiness?.enabled ?? false,
    can_search_live: readiness?.can_search_live ?? false,
    can_revalidate_live: readiness?.can_revalidate_live ?? false,
    blocking_reasons: readiness?.blocking_reasons ?? []
  };
}

function noOfferDiagnostics(route: DuffelSmokeInput): string[] {
  return [
    "API call succeeded.",
    "No offers returned.",
    "This is likely a Duffel sandbox route/date availability issue, not a provider credential failure.",
    `Try the Duffel Airways sandbox profile: --profile duffel-airways --origin LHR --destination JFK --departure-date ${route.departureDate} --return-date ${route.returnDate}.`
  ];
}

function offerSummary(input: {
  route: DuffelSmokeInput;
  offersReturned: number;
  offer: ProviderOffer | null;
  revalidatedOffer: ProviderOffer | null;
  readiness: ProviderReadinessReport | null;
}): DuffelSmokeSummary {
  const displayOffer = input.revalidatedOffer ?? input.offer;
  return {
    provider: "duffel",
    profile: input.route.profile,
    origin: input.route.originIata,
    destination: input.route.destinationIata,
    departure_date: input.route.departureDate,
    return_date: input.route.returnDate,
    cabin: input.route.cabinClass,
    adults: input.route.adults,
    currency: input.route.currency,
    api_call_succeeded: true,
    offers_returned: input.offersReturned,
    no_offers_returned: input.offersReturned === 0,
    price_myr: displayOffer ? `RM${formatMyrFromMinor(displayOffer.price.amountMinor) ?? "0.00"}` : null,
    carrier: displayOffer?.carriers.join(", ") || null,
    stops: displayOffer?.totalStops ?? null,
    duration_minutes: displayOffer?.durationMinutes ?? null,
    expires_at: displayOffer?.expiresAt ?? null,
    last_revalidated_at: input.revalidatedOffer?.lastVerifiedAt ?? null,
    diagnostics: input.offersReturned === 0 ? noOfferDiagnostics(input.route) : [],
    readiness_status: readinessStatus(input.readiness)
  };
}

function formatBlocked(reasons: readonly DuffelSmokeBlockingReason[], readiness: ProviderReadinessReport | null, route: DuffelSmokeInput): string {
  return [
    "Duffel smoke blocked.",
    `Route: ${route.originIata}-${route.destinationIata} ${route.departureDate} to ${route.returnDate}`,
    `Profile: ${route.profile}, cabin=${route.cabinClass}, adults=${route.adults}, currency=${route.currency}`,
    "Blocking reasons:",
    ...reasons.map((reason) => `- ${reason}`),
    `Readiness: enabled=${readiness?.enabled ?? false}, can_search_live=${readiness?.can_search_live ?? false}, can_revalidate_live=${readiness?.can_revalidate_live ?? false}`,
    "No Duffel network call was made."
  ].join("\n");
}

function formatSummary(summary: DuffelSmokeSummary): string {
  const lines = [
    "Duffel smoke complete.",
    JSON.stringify(summary, null, 2)
  ];
  if (summary.no_offers_returned) {
    lines.push("Diagnostics:");
    lines.push(...summary.diagnostics.map((message) => `- ${message}`));
  }
  return lines.join("\n");
}

function formatFailure(message: string, readiness: ProviderReadinessReport | null, route: DuffelSmokeInput): string {
  return [
    "Duffel smoke failed.",
    `Route: ${route.originIata}-${route.destinationIata} ${route.departureDate} to ${route.returnDate}`,
    `Profile: ${route.profile}, cabin=${route.cabinClass}, adults=${route.adults}, currency=${route.currency}`,
    `Readiness: enabled=${readiness?.enabled ?? false}, can_search_live=${readiness?.can_search_live ?? false}, can_revalidate_live=${readiness?.can_revalidate_live ?? false}`,
    `Error: ${message}`
  ].join("\n");
}

export function duffelSmokeStatusFromResult(result: DuffelSmokeResult, checkedAt: string): DuffelSmokeStatusRecord {
  const summary = result.summary;
  const route = summary
    ? {
        origin: summary.origin,
        destination: summary.destination,
        departure_date: summary.departure_date,
        return_date: summary.return_date
      }
    : {
        origin: "",
        destination: "",
        departure_date: "",
        return_date: ""
      };
  return {
    provider_name: "duffel",
    status: result.ok
      ? (summary?.offers_returned === 0 ? "no_offers_returned" : "succeeded")
      : (result.blockingReasons.length > 0 ? "blocked" : "failed"),
    offers_returned: summary?.offers_returned ?? null,
    checked_at: checkedAt,
    origin: route.origin,
    destination: route.destination,
    departure_date: route.departure_date,
    return_date: route.return_date
  };
}

export async function runDuffelSmoke(options: DuffelSmokeOptions): Promise<DuffelSmokeResult> {
  const now = options.now ?? Date.now;
  const nowMs = now();
  const route = resolveDuffelSmokeInput(options.input, options.env, nowMs);
  const effectiveEnv = effectiveDuffelEnv(options.env, route);
  const realConfig = parseRealProviderConfig(effectiveEnv);
  const duffelConfig = parseDuffelConfig(effectiveEnv);
  const providerDeps: { fetch?: typeof fetch; now: () => number; sleep?: (ms: number) => Promise<void> } = { now };
  if (options.fetch) providerDeps.fetch = options.fetch;
  if (options.sleep) providerDeps.sleep = options.sleep;
  const provider = new DuffelProvider(duffelConfig, realConfig, providerDeps);
  const readiness = readinessForDuffel({ env: options.env, provider, route });
  const blockingReasons = smokeGuards({ env: options.env, route, nowMs });

  if (blockingReasons.length > 0) {
    return {
      ok: false,
      exitCode: 1,
      blockingReasons,
      readiness,
      summary: null,
      output: formatBlocked(blockingReasons, readiness, route)
    };
  }

  try {
    const searchInput: SearchRoundTripInput = {
      originIata: route.originIata,
      destinationIata: route.destinationIata,
      departureDate: route.departureDate,
      returnDate: route.returnDate,
      adults: route.adults,
      maxOffers: 5
    };
    const offers = await provider.searchRoundTripOffers(searchInput);
    const firstOffer = offers[0] ?? null;
    const revalidatedOffer = firstOffer
      ? await provider.revalidateOffer({
          providerOfferId: firstOffer.providerOfferId,
          originIata: firstOffer.originIata,
          destinationIata: firstOffer.destinationIata,
          departureDate: firstOffer.departureDate,
          returnDate: firstOffer.returnDate,
          revalidationPayload: firstOffer.revalidationPayload
        })
      : null;
    const summary = offerSummary({
      route,
      offersReturned: offers.length,
      offer: firstOffer,
      revalidatedOffer,
      readiness
    });
    return {
      ok: true,
      exitCode: 0,
      blockingReasons: [],
      readiness,
      summary,
      output: formatSummary(summary)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Duffel smoke failure";
    return {
      ok: false,
      exitCode: 1,
      blockingReasons: [],
      readiness,
      summary: null,
      output: formatFailure(message, readiness, route)
    };
  }
}

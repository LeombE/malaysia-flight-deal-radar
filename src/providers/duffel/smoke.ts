import { parseDuffelConfig } from "../../config/duffel.ts";
import { parseRealProviderConfig } from "../../config/real-providers.ts";
import { formatMyrFromMinor } from "../../scoring/statistics.ts";
import { buildProviderReadinessReports, type ProviderReadinessReport } from "../readiness.ts";
import type { ProviderOffer, SearchRoundTripInput } from "../types.ts";
import { DuffelProvider } from "./duffel-provider.ts";

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
  | "invalid_smoke_route";

export interface DuffelSmokeInput {
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
}

export interface DuffelSmokeSummary {
  provider: "duffel";
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  cabin: "economy";
  adults: 1;
  currency: "MYR";
  offers_returned: number;
  price_myr: string | null;
  carrier: string | null;
  stops: number | null;
  duration_minutes: number | null;
  expires_at: string | null;
  last_revalidated_at: string | null;
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

function addDaysIso(nowMs: number, days: number): string {
  return new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10);
}

function normalizeIata(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toUpperCase();
}

function resolveInput(input: Partial<DuffelSmokeInput> | undefined, env: Record<string, string | undefined>, nowMs: number): DuffelSmokeInput {
  return {
    originIata: normalizeIata(input?.originIata ?? env.DUFFEL_SMOKE_ORIGIN, "KUL"),
    destinationIata: normalizeIata(input?.destinationIata ?? env.DUFFEL_SMOKE_DESTINATION, "SIN"),
    departureDate: input?.departureDate ?? env.DUFFEL_SMOKE_DEPARTURE_DATE ?? addDaysIso(nowMs, 90),
    returnDate: input?.returnDate ?? env.DUFFEL_SMOKE_RETURN_DATE ?? addDaysIso(nowMs, 95)
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

function smokeGuards(input: {
  env: Record<string, string | undefined>;
  route: DuffelSmokeInput;
  nowMs: number;
}): DuffelSmokeBlockingReason[] {
  const realConfig = parseRealProviderConfig(input.env);
  const duffelConfig = parseDuffelConfig(input.env);
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
  if (!routeIsValid(input.route, input.nowMs)) reasons.push("invalid_smoke_route");

  return [...new Set(reasons)];
}

function readinessForDuffel(input: {
  env: Record<string, string | undefined>;
  provider: DuffelProvider;
}): ProviderReadinessReport | null {
  const reports = buildProviderReadinessReports({
    providers: [input.provider],
    env: input.env,
    config: parseRealProviderConfig(input.env),
    providerLimits: [{
      providerName: "duffel",
      dailyBudget: parseRealProviderConfig(input.env).maxRealProviderDailyBudget,
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
    origin: input.route.originIata,
    destination: input.route.destinationIata,
    departure_date: input.route.departureDate,
    return_date: input.route.returnDate,
    cabin: "economy",
    adults: 1,
    currency: "MYR",
    offers_returned: input.offersReturned,
    price_myr: displayOffer ? `RM${formatMyrFromMinor(displayOffer.price.amountMinor) ?? "0.00"}` : null,
    carrier: displayOffer?.carriers.join(", ") || null,
    stops: displayOffer?.totalStops ?? null,
    duration_minutes: displayOffer?.durationMinutes ?? null,
    expires_at: displayOffer?.expiresAt ?? null,
    last_revalidated_at: input.revalidatedOffer?.lastVerifiedAt ?? null,
    readiness_status: readinessStatus(input.readiness)
  };
}

function formatBlocked(reasons: readonly DuffelSmokeBlockingReason[], readiness: ProviderReadinessReport | null, route: DuffelSmokeInput): string {
  return [
    "Duffel smoke blocked.",
    `Route: ${route.originIata}-${route.destinationIata} ${route.departureDate} to ${route.returnDate}`,
    "Blocking reasons:",
    ...reasons.map((reason) => `- ${reason}`),
    `Readiness: enabled=${readiness?.enabled ?? false}, can_search_live=${readiness?.can_search_live ?? false}, can_revalidate_live=${readiness?.can_revalidate_live ?? false}`,
    "No Duffel network call was made."
  ].join("\n");
}

function formatSummary(summary: DuffelSmokeSummary): string {
  return [
    "Duffel smoke complete.",
    JSON.stringify(summary, null, 2)
  ].join("\n");
}

function formatFailure(message: string, readiness: ProviderReadinessReport | null, route: DuffelSmokeInput): string {
  return [
    "Duffel smoke failed.",
    `Route: ${route.originIata}-${route.destinationIata} ${route.departureDate} to ${route.returnDate}`,
    `Readiness: enabled=${readiness?.enabled ?? false}, can_search_live=${readiness?.can_search_live ?? false}, can_revalidate_live=${readiness?.can_revalidate_live ?? false}`,
    `Error: ${message}`
  ].join("\n");
}

export async function runDuffelSmoke(options: DuffelSmokeOptions): Promise<DuffelSmokeResult> {
  const now = options.now ?? Date.now;
  const nowMs = now();
  const route = resolveInput(options.input, options.env, nowMs);
  const realConfig = parseRealProviderConfig(options.env);
  const duffelConfig = parseDuffelConfig(options.env);
  const providerDeps: { fetch?: typeof fetch; now: () => number; sleep?: (ms: number) => Promise<void> } = { now };
  if (options.fetch) providerDeps.fetch = options.fetch;
  if (options.sleep) providerDeps.sleep = options.sleep;
  const provider = new DuffelProvider(duffelConfig, realConfig, providerDeps);
  const readiness = readinessForDuffel({ env: options.env, provider });
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
      adults: 1,
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

import type { SchedulerConfig } from "../config/scheduler.ts";
import type { PlannedSearchJob, RoutePrioritySource, ScanRouteCandidate } from "./types.ts";

function routeKey(route: ScanRouteCandidate): string {
  return `${route.originIata}|${route.destinationIata}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stableSort(routes: ScanRouteCandidate[]): ScanRouteCandidate[] {
  return [...routes].sort((left, right) => {
    const priorityDiff = (left.priority ?? 100) - (right.priority ?? 100);
    if (priorityDiff !== 0) return priorityDiff;
    return routeKey(left).localeCompare(routeKey(right));
  });
}

export function prioritizeRoutes(buckets: {
  watchlist: ScanRouteCandidate[];
  previousDeal: ScanRouteCandidate[];
  popularSeed: ScanRouteCandidate[];
  exploration: ScanRouteCandidate[];
}): ScanRouteCandidate[] {
  const seen = new Set<string>();
  const output: ScanRouteCandidate[] = [];

  const append = (routes: ScanRouteCandidate[], prioritySource: RoutePrioritySource) => {
    for (const route of stableSort(routes)) {
      const key = routeKey(route);
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({ ...route, prioritySource });
    }
  };

  append(buckets.watchlist, "watchlist");
  append(buckets.previousDeal, "previous_deal");
  append(buckets.popularSeed, "popular_seed");
  append(buckets.exploration, "exploration");
  return output;
}

export function planSearchJobs(input: {
  routes: ScanRouteCandidate[];
  providerNames: string[];
  config: SchedulerConfig;
  now: Date;
  idFactory: () => string;
}): PlannedSearchJob[] {
  const jobs: PlannedSearchJob[] = [];
  const defaultDepartureDate = addDays(input.now, input.config.departureOffsetDays);
  const defaultReturnDate = addDays(defaultDepartureDate, input.config.defaultStayLengthDays);

  for (const route of input.routes) {
    for (const providerName of input.providerNames) {
      if (jobs.length >= input.config.maxSearchesPerCronRun) return jobs;
      const departureDate = route.departureDate ?? isoDate(defaultDepartureDate);
      const stayLengthDays = route.stayLengthDays ?? input.config.defaultStayLengthDays;
      const returnDate = route.returnDate ?? isoDate(addDays(new Date(`${departureDate}T00:00:00.000Z`), stayLengthDays));

      jobs.push({
        id: input.idFactory(),
        providerName,
        originIata: route.originIata,
        destinationIata: route.destinationIata,
        departureDate,
        returnDate,
        stayLengthDays,
        cabinClass: "economy",
        adults: 1,
        prioritySource: route.prioritySource ?? "exploration",
        status: "queued",
        queuedAt: input.now.toISOString()
      });
    }
  }

  return jobs;
}


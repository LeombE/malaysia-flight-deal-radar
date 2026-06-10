import type { SchedulerConfig } from "../config/scheduler.ts";
import type { FlightProvider, ProviderOffer } from "../providers/types.ts";
import { scoreDeal } from "../scoring/deal-scoring.ts";
import { planSearchJobs, prioritizeRoutes } from "./route-priority.ts";
import type {
  PersistedDealScore,
  PersistedFareCheck,
  PersistedFareSnapshot,
  PlannedSearchJob,
  ProviderLimitState,
  ScanRepository,
  ScanRunResult
} from "./types.ts";

export interface StructuredLogger {
  log(event: string, fields: Record<string, unknown>): void;
}

export interface ScheduledScanOptions {
  repository: ScanRepository;
  providers: FlightProvider[];
  config: SchedulerConfig;
  now?: Date;
  idFactory?: () => string;
  logger?: StructuredLogger;
}

function defaultIdFactory(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function providerMap(providers: FlightProvider[]): Map<string, FlightProvider> {
  return new Map(providers.map((provider) => [provider.name, provider]));
}

function defaultLimit(providerName: string, config: SchedulerConfig): ProviderLimitState {
  return {
    providerName,
    retentionMode: "NO_CACHE",
    dailyBudget: config.providerDailyBudget,
    usedToday: 0,
    concurrencyLimit: config.maxProviderConcurrency,
    healthStatus: "available",
    failureCount: 0
  };
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const promise = worker(item).finally(() => {
      executing.delete(promise);
    });
    executing.add(promise);
    if (executing.size >= Math.max(1, limit)) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

function cloneOfferForNoAlert(original: ProviderOffer): ProviderOffer {
  return {
    ...original,
    display: {
      canAlert: false,
      canDisplay: false,
      requiresRevalidation: true,
      reason: "revalidation_failed"
    }
  };
}

function fareCheckFromOffer(input: {
  id: string;
  job: PlannedSearchJob;
  offer: ProviderOffer;
  isRevalidated: boolean;
  checkedAt: string;
}): PersistedFareCheck {
  const record: PersistedFareCheck = {
    id: input.id,
    searchJobId: input.job.id,
    provider: input.offer.provider,
    providerOfferId: input.offer.providerOfferId,
    originIata: input.offer.originIata,
    destinationIata: input.offer.destinationIata,
    departureDate: input.offer.departureDate,
    returnDate: input.offer.returnDate,
    amountMinorMyr: input.offer.price.amountMinor,
    totalStops: input.offer.totalStops,
    durationMinutes: input.offer.durationMinutes,
    carriers: input.offer.carriers,
    selfTransfer: false,
    retentionMode: input.offer.retentionMode,
    isRevalidated: input.isRevalidated,
    checkedAt: input.checkedAt,
    rawPayloadStored: false
  };
  if (input.isRevalidated) {
    record.lastRevalidatedAt = input.offer.lastVerifiedAt;
  }
  if (input.offer.expiresAt) {
    record.expiresAt = input.offer.expiresAt;
  }
  return record;
}

function snapshotFromOffer(input: {
  id: string;
  job: PlannedSearchJob;
  offer: ProviderOffer;
  observedAt: string;
}): PersistedFareSnapshot {
  return {
    id: input.id,
    provider: input.offer.provider,
    originIata: input.offer.originIata,
    destinationIata: input.offer.destinationIata,
    departureDate: input.offer.departureDate,
    returnDate: input.offer.returnDate,
    stayLengthDays: input.job.stayLengthDays,
    amountMinorMyr: input.offer.price.amountMinor,
    observedAt: input.observedAt,
    retentionMode: input.offer.retentionMode,
    rawPayloadStored: false
  };
}

function dealScoreRecordFromResult(input: {
  id: string;
  fareCheckId: string;
  scoredAt: string;
  result: ReturnType<typeof scoreDeal>;
}): PersistedDealScore {
  return {
    id: input.id,
    fareCheckId: input.fareCheckId,
    amountMinorMyr: input.result.amount_minor_myr,
    baselineMedianMinorMyr: input.result.baseline_median_minor_myr,
    historicalP10MinorMyr: input.result.historical_p10_minor_myr,
    sampleSize: input.result.sample_size,
    discountPct: input.result.discount_pct,
    score: input.result.score,
    dealLabel: input.result.deal_label,
    alertEligible: input.result.alert_eligible,
    reasons: input.result.reasons,
    scoredAt: input.scoredAt
  };
}

export async function runScheduledScan(options: ScheduledScanOptions): Promise<ScanRunResult> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const idFactory = options.idFactory ?? defaultIdFactory;
  const runId = idFactory();
  const providersByName = providerMap(options.providers);
  const providerNames = options.providers.map((provider) => provider.name);
  const result: ScanRunResult = {
    runId,
    jobsCreated: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    jobsSkipped: 0,
    offersSeen: 0,
    fareChecksInserted: 0,
    fareSnapshotsInserted: 0,
    dealScoresInserted: 0,
    revalidationsAttempted: 0,
    providerBudgetUsed: 0
  };

  options.logger?.log("scan_started", { runId, providerNames, at: nowIso });

  const routes = prioritizeRoutes({
    watchlist: await options.repository.listWatchlistRoutes(),
    previousDeal: await options.repository.listPreviousDealRoutes(),
    popularSeed: await options.repository.listPopularSeedRoutes(),
    exploration: await options.repository.listExplorationRoutes()
  });

  const jobs = planSearchJobs({
    routes,
    providerNames,
    config: options.config,
    now,
    idFactory
  });

  const jobLimitByProvider = new Map<string, number>();
  const providerLimitByName = new Map<string, ProviderLimitState>();
  const acceptedJobs: PlannedSearchJob[] = [];

  for (const job of jobs) {
    const providerLimit = await options.repository.getProviderLimit(job.providerName) ?? defaultLimit(job.providerName, options.config);
    providerLimitByName.set(job.providerName, providerLimit);
    const remainingBudget = Math.max(0, Math.min(providerLimit.dailyBudget, options.config.providerDailyBudget) - providerLimit.usedToday);
    const acceptedForProvider = jobLimitByProvider.get(job.providerName) ?? 0;
    if (acceptedForProvider >= remainingBudget) continue;
    jobLimitByProvider.set(job.providerName, acceptedForProvider + 1);
    acceptedJobs.push(job);
  }

  for (const job of acceptedJobs) {
    await options.repository.createSearchJob(job);
  }
  result.jobsCreated = acceptedJobs.length;

  const jobsByProvider = new Map<string, PlannedSearchJob[]>();
  for (const job of acceptedJobs) {
    jobsByProvider.set(job.providerName, [...(jobsByProvider.get(job.providerName) ?? []), job]);
  }

  for (const [providerName, providerJobs] of jobsByProvider) {
    const limit = providerLimitByName.get(providerName) ?? defaultLimit(providerName, options.config);
    const concurrency = Math.max(1, Math.min(options.config.maxProviderConcurrency, limit.concurrencyLimit));
    await runWithConcurrency(providerJobs, concurrency, async (job) => {
      const provider = providersByName.get(job.providerName);
      if (!provider || !provider.isEnabled()) {
        await options.repository.updateSearchJob(job.id, {
          status: "provider_disabled",
          completedAt: nowIso,
          errorCode: "provider_disabled",
          errorMessage: "Provider is disabled or unavailable"
        });
        result.jobsSkipped += 1;
        return;
      }

      await options.repository.updateSearchJob(job.id, {
        status: "running",
        startedAt: nowIso
      });
      await options.repository.incrementProviderUsage(job.providerName, 1, nowIso);
      result.providerBudgetUsed += 1;

      try {
        const offers = await provider.searchRoundTripOffers({
          originIata: job.originIata,
          destinationIata: job.destinationIata,
          departureDate: job.departureDate,
          returnDate: job.returnDate,
          adults: job.adults
        });
        result.offersSeen += offers.length;

        for (const offer of offers) {
          result.revalidationsAttempted += 1;
          const revalidatedOffer = await provider.revalidateOffer({
            providerOfferId: offer.providerOfferId,
            originIata: offer.originIata,
            destinationIata: offer.destinationIata,
            departureDate: offer.departureDate,
            returnDate: offer.returnDate,
            revalidationPayload: offer.revalidationPayload
          });
          const normalizedOffer = revalidatedOffer ?? cloneOfferForNoAlert(offer);
          const isRevalidated = revalidatedOffer !== null;

          const fareCheckId = idFactory();
          const historicalSamples = await options.repository.getHistoricalSamples(job);
          await options.repository.insertFareCheck(fareCheckFromOffer({
            id: fareCheckId,
            job,
            offer: normalizedOffer,
            isRevalidated,
            checkedAt: nowIso
          }));
          result.fareChecksInserted += 1;

          await options.repository.insertFareSnapshot(snapshotFromOffer({
            id: idFactory(),
            job,
            offer: normalizedOffer,
            observedAt: nowIso
          }));
          result.fareSnapshotsInserted += 1;

          const score = scoreDeal({
            offer: normalizedOffer,
            historicalSamples,
            isWatchlistRoute: job.prioritySource === "watchlist",
            freshWithinMinutes: options.config.revalidateBeforeAlertMinutes,
            now
          });

          await options.repository.insertDealScore(dealScoreRecordFromResult({
            id: idFactory(),
            fareCheckId,
            scoredAt: nowIso,
            result: score
          }));
          result.dealScoresInserted += 1;
        }

        await options.repository.updateSearchJob(job.id, {
          status: "succeeded",
          completedAt: nowIso
        });
        await options.repository.recordProviderSuccess(job.providerName, nowIso);
        await options.repository.markRouteScanned(job, nowIso);
        result.jobsSucceeded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown provider error";
        await options.repository.updateSearchJob(job.id, {
          status: "failed",
          completedAt: nowIso,
          errorCode: "provider_error",
          errorMessage: message
        });
        await options.repository.recordProviderFailure(job.providerName, nowIso, options.config.providerFailureDegradeThreshold);
        result.jobsFailed += 1;
        options.logger?.log("scan_job_failed", { runId, jobId: job.id, providerName: job.providerName, message });
      }
    });
  }

  options.logger?.log("scan_completed", { ...result });
  return result;
}

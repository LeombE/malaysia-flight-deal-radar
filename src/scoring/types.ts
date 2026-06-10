import type { ProviderOffer } from "../providers/types.ts";

export type DealLabel =
  | "no_deal"
  | "watched_price"
  | "suspected_deal"
  | "strong_deal"
  | "urgent_revalidate"
  | "expired";

export interface HistoricalFareSample {
  amountMinorMyr: number;
  observedAt?: string;
}

export interface ScoreDealOptions {
  offer: ProviderOffer;
  historicalSamples: HistoricalFareSample[];
  isWatchlistRoute?: boolean;
  maxStops?: number;
  freshWithinMinutes?: number;
  now?: Date;
  selfTransfer?: boolean;
}

export interface DealScoreResult {
  current_price_myr: string;
  historical_median_myr: string | null;
  historical_p10_myr: string | null;
  amount_minor_myr: number;
  baseline_median_minor_myr: number | null;
  historical_p10_minor_myr: number | null;
  sample_size: number;
  discount_pct: number;
  score: number;
  deal_label: DealLabel;
  alert_eligible: boolean;
  reasons: string[];
  quality_penalty: number;
}


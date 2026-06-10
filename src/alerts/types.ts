import type { ProviderOffer } from "../providers/types.ts";
import type { DealLabel, DealScoreResult } from "../scoring/types.ts";

export type AlertSendStatus = "sent" | "skipped" | "disabled" | "failed" | "duplicate";

export interface AlertEvaluationInput {
  offer: ProviderOffer;
  score: DealScoreResult;
  now: Date;
  recentlyRevalidated: boolean;
  revalidateBeforeAlertMinutes: number;
  cooldownHours: number;
  previousAlerts: SentAlertLookupRecord[];
}

export interface AlertEligibilityResult {
  eligible: boolean;
  status: AlertSendStatus;
  dedupeKey: string;
  reasons: string[];
  cooldownUntil?: string;
}

export interface SentAlertLookupRecord {
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  provider: string;
  dealLabel: DealLabel;
  sentAt: string;
}

export interface AlertMessageInput {
  offer: ProviderOffer;
  score: DealScoreResult;
  stayLengthDays: number;
  deepLink?: string;
}

export interface TelegramSendResult {
  status: AlertSendStatus;
  messageId?: number;
  errorCode?: string;
  errorMessage?: string;
  dryRun?: boolean;
}

export interface PersistedAlertRecord {
  id: string;
  dealScoreId: string;
  dedupeKey: string;
  alertType: "telegram_deal";
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  provider: string;
  providerName: string;
  dealLabel: DealLabel;
  dealScore: number;
  amountMinorMyr: number;
  baselineMedianMinorMyr: number | null;
  discountPct: number;
  status: AlertSendStatus;
  sentAt: string;
  cooldownUntil: string;
  errorCode?: string;
  errorMessage?: string;
  messageHash: string;
}

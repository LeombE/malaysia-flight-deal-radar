import type { DealLabel } from "../scoring/types.ts";

export interface AlertDedupeInput {
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  provider: string;
  dealLabel: DealLabel;
}

export interface SentAlertRecord extends AlertDedupeInput {
  sentAt: string;
}

export interface DuplicateAlertCheck {
  isDuplicate: boolean;
  dedupeKey: string;
  matchedAlert?: SentAlertRecord;
  cooldownUntil?: string;
}

export function buildAlertDedupeKey(input: AlertDedupeInput): string {
  return [
    input.originIata,
    input.destinationIata,
    input.departureDate,
    input.returnDate,
    input.provider,
    input.dealLabel
  ].join("|");
}

export function isDuplicateAlertWithinCooldown(
  input: AlertDedupeInput,
  previousAlerts: readonly SentAlertRecord[],
  options: { now: Date; cooldownMinutes: number }
): DuplicateAlertCheck {
  const dedupeKey = buildAlertDedupeKey(input);
  const cooldownMs = options.cooldownMinutes * 60_000;

  for (const alert of previousAlerts) {
    if (buildAlertDedupeKey(alert) !== dedupeKey) continue;
    const sentAtMs = Date.parse(alert.sentAt);
    if (!Number.isFinite(sentAtMs)) continue;
    const cooldownUntilMs = sentAtMs + cooldownMs;
    if (cooldownUntilMs > options.now.getTime()) {
      return {
        isDuplicate: true,
        dedupeKey,
        matchedAlert: alert,
        cooldownUntil: new Date(cooldownUntilMs).toISOString()
      };
    }
  }

  return {
    isDuplicate: false,
    dedupeKey
  };
}


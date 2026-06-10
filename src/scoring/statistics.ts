export function validMinorUnitSamples(values: readonly number[]): number[] {
  return values
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right);
}

export function median(values: readonly number[]): number | null {
  const sorted = validMinorUnitSamples(values);
  if (sorted.length === 0) return null;

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (lower === undefined || upper === undefined) return null;
  return Math.round((lower + upper) / 2);
}

export function percentile(values: readonly number[], percentileRank: number): number | null {
  const sorted = validMinorUnitSamples(values);
  if (sorted.length === 0) return null;

  const boundedRank = Math.min(100, Math.max(0, percentileRank));
  if (boundedRank === 0) return sorted[0] ?? null;

  const nearestRankIndex = Math.ceil((boundedRank / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, nearestRankIndex))] ?? null;
}

export function p10(values: readonly number[]): number | null {
  return percentile(values, 10);
}

export function discountPercentage(currentMinor: number, baselineMedianMinor: number | null): number {
  if (!baselineMedianMinor || baselineMedianMinor <= 0 || currentMinor <= 0) return 0;
  const discount = ((baselineMedianMinor - currentMinor) / baselineMedianMinor) * 100;
  return Math.max(0, Math.round(discount * 100) / 100);
}

export function formatMyrFromMinor(amountMinor: number | null): string | null {
  if (amountMinor === null) return null;
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}


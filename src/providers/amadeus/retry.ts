import { AmadeusProviderError } from "./errors.ts";

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1_000));
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

export function isTransientStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function jitteredDelay(attempt: number, options: RetryOptions, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const exponential = options.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(exponential * 0.1);
  return Math.min(options.maxDelayMs, exponential + jitter);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = error instanceof AmadeusProviderError ? error.status : undefined;
      if (!status || !isTransientStatus(status) || attempt >= options.maxAttempts) {
        throw error;
      }
      await options.sleep(jitteredDelay(attempt, options, error.retryAfterMs));
    }
  }
  throw lastError;
}

export class AmadeusRequestLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  private lastStartedAt = 0;
  private readonly maxConcurrency: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    maxConcurrency: number,
    minIntervalMs: number,
    now: () => number,
    sleep: (ms: number) => Promise<void>
  ) {
    this.maxConcurrency = maxConcurrency;
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleep = sleep;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      const waitMs = Math.max(0, this.lastStartedAt + this.minIntervalMs - this.now());
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
      this.lastStartedAt = this.now();
      return await operation();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

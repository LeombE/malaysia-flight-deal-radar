import type { TravelpayoutsConfig } from "../../config/travelpayouts.ts";
import { TravelpayoutsProviderError } from "./errors.ts";

export interface TravelpayoutsHttpClientDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(attempt: number, retryAfterMs: number | undefined): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  return Math.min(2000, 250 * 2 ** Math.max(0, attempt - 1));
}

export class TravelpayoutsHttpClient {
  private readonly config: TravelpayoutsConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: TravelpayoutsConfig, deps: TravelpayoutsHttpClientDeps = {}) {
    this.config = config;
    this.fetchImpl = deps.fetch ?? fetch;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  async requestJson(url: string, context: string): Promise<unknown> {
    let lastError: unknown;
    const maxAttempts = this.config.retryLimit + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.fetchJsonOnce(url, context);
      } catch (error) {
        lastError = error;
        const providerError = error instanceof TravelpayoutsProviderError ? error : undefined;
        const status = providerError?.status;
        if (!status || !isTransientStatus(status) || attempt >= maxAttempts) {
          throw error;
        }
        await this.sleep(retryDelayMs(attempt, providerError.retryAfterMs));
      }
    }
    throw lastError;
  }

  private async fetchJsonOnce(url: string, context: string): Promise<unknown> {
    if (!this.config.token) {
      throw new TravelpayoutsProviderError(`Travelpayouts ${context} skipped because credentials are missing`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "x-access-token": this.config.token
        },
        signal: controller.signal
      });
      if (!response.ok) {
        const errorOptions: { status: number; retryAfterMs?: number } = { status: response.status };
        const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
        if (retryAfterMs !== undefined) errorOptions.retryAfterMs = retryAfterMs;
        throw new TravelpayoutsProviderError(`Travelpayouts ${context} failed with HTTP ${response.status}`, errorOptions);
      }
      return response.json();
    } catch (error) {
      if (error instanceof TravelpayoutsProviderError) throw error;
      throw new TravelpayoutsProviderError(`Travelpayouts ${context} request failed`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

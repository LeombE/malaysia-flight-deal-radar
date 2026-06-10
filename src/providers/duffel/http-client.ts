import type { DuffelConfig } from "../../config/duffel.ts";
import { DuffelProviderError } from "./errors.ts";

export interface DuffelHttpClientDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1_000));
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(attempt: number, retryAfterMs: number | undefined): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const base = 250 * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(base * 0.1);
  return Math.min(2_000, base + jitter);
}

export class DuffelHttpClient {
  private readonly config: DuffelConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: DuffelConfig, deps: DuffelHttpClientDeps = {}) {
    this.config = config;
    this.fetchImpl = deps.fetch ?? fetch;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  async requestJson(url: string, init: RequestInit, context: string): Promise<unknown> {
    let lastError: unknown;
    const maxAttempts = this.config.retryLimit + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.fetchJsonOnce(url, init, context);
      } catch (error) {
        lastError = error;
        const providerError = error instanceof DuffelProviderError ? error : undefined;
        const status = providerError?.status;
        if (!status || !isTransientStatus(status) || attempt >= maxAttempts) {
          throw error;
        }
        await this.sleep(retryDelayMs(attempt, providerError.retryAfterMs));
      }
    }
    throw lastError;
  }

  private async fetchJsonOnce(url: string, init: RequestInit, context: string): Promise<unknown> {
    if (!this.config.accessToken) {
      throw new DuffelProviderError(`Duffel ${context} skipped because credentials are missing`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${this.config.accessToken}`);
      headers.set("Duffel-Version", this.config.apiVersion);
      const response = await this.fetchImpl(url, {
        ...init,
        headers,
        signal: controller.signal
      });
      if (!response.ok) {
        const errorOptions: { status: number; retryAfterMs?: number } = { status: response.status };
        const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
        if (retryAfterMs !== undefined) errorOptions.retryAfterMs = retryAfterMs;
        throw new DuffelProviderError(`Duffel ${context} failed with HTTP ${response.status}`, errorOptions);
      }
      return response.json();
    } catch (error) {
      if (error instanceof DuffelProviderError) throw error;
      throw new DuffelProviderError(`Duffel ${context} request failed`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class AmadeusProviderError extends Error {
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "AmadeusProviderError";
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function sanitizeAmadeusError(status: number, context: string): AmadeusProviderError {
  return new AmadeusProviderError(`Amadeus ${context} failed with HTTP ${status}`, { status });
}

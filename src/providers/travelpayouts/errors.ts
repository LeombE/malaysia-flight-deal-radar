export class TravelpayoutsProviderError extends Error {
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "TravelpayoutsProviderError";
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

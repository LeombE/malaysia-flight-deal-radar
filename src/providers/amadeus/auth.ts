import type { AmadeusConfig } from "../../config/amadeus.ts";
import { isAmadeusEnabled } from "../../config/amadeus.ts";
import { AmadeusProviderError, sanitizeAmadeusError } from "./errors.ts";
import { buildTokenRequest } from "./request-builder.ts";
import { parseTokenResponse } from "./schemas.ts";

export interface AmadeusAuthDeps {
  fetch: typeof fetch;
  now: () => number;
}

export interface CachedAmadeusToken {
  accessToken: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedAmadeusToken>();
const pendingTokenRequests = new Map<string, Promise<string>>();

function cacheKey(config: AmadeusConfig): string {
  return `${config.baseUrl}|${config.clientId ?? ""}`;
}

export function clearAmadeusTokenCache(): void {
  tokenCache.clear();
  pendingTokenRequests.clear();
}

export class AmadeusTokenManager {
  private readonly config: AmadeusConfig;
  private readonly deps: AmadeusAuthDeps;

  constructor(config: AmadeusConfig, deps: AmadeusAuthDeps) {
    this.config = config;
    this.deps = deps;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!isAmadeusEnabled(this.config)) {
      throw new AmadeusProviderError("Amadeus credentials are not configured");
    }

    const key = cacheKey(this.config);
    const cached = tokenCache.get(key);
    if (
      !forceRefresh &&
      cached &&
      cached.expiresAtMs - this.config.tokenSafetyBufferMs > this.deps.now()
    ) {
      return cached.accessToken;
    }

    const pending = pendingTokenRequests.get(key);
    if (pending && !forceRefresh) {
      return pending;
    }

    const request = this.fetchAndCacheToken(key);
    pendingTokenRequests.set(key, request);
    try {
      return await request;
    } finally {
      pendingTokenRequests.delete(key);
    }
  }

  private async fetchAndCacheToken(key: string): Promise<string> {
    const request = buildTokenRequest(this.config);
    const init: RequestInit = {
      method: request.method ?? "POST"
    };
    if (request.headers !== undefined) {
      init.headers = request.headers;
    }
    if (request.body !== undefined) {
      init.body = request.body;
    }
    const response = await this.deps.fetch(request.url, init);

    if (!response.ok) {
      throw sanitizeAmadeusError(response.status, "OAuth token request");
    }

    const parsed = parseTokenResponse(await response.json());
    const expiresAtMs = this.deps.now() + parsed.expires_in * 1_000;
    tokenCache.set(key, {
      accessToken: parsed.access_token,
      expiresAtMs
    });
    return parsed.access_token;
  }
}

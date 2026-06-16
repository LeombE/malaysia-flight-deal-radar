import { parseCachedProviderConfig } from "../config/cached-providers.ts";
import { parseTravelpayoutsConfig } from "../config/travelpayouts.ts";
import type { CachedFareProvider } from "./cached-types.ts";
import { TravelpayoutsProvider } from "./travelpayouts/travelpayouts-provider.ts";

export interface CachedProviderRegistryOptions {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createCachedProviderRegistry(
  env: Record<string, string | undefined>,
  options: CachedProviderRegistryOptions = {}
): CachedFareProvider[] {
  return [
    new TravelpayoutsProvider(
      parseTravelpayoutsConfig(env),
      parseCachedProviderConfig(env),
      options
    )
  ];
}

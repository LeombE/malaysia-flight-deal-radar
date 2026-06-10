import { parseAmadeusConfig } from "../config/amadeus.ts";
import { parseDuffelConfig } from "../config/duffel.ts";
import { parseRealProviderConfig } from "../config/real-providers.ts";
import { AmadeusProvider } from "./amadeus/amadeus-provider.ts";
import { DuffelProvider } from "./duffel/duffel-provider.ts";
import { MockProvider } from "./mock-provider.ts";
import type { FlightProvider } from "./types.ts";

export interface ProviderRegistryOptions {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createProviderRegistry(
  env: Record<string, string | undefined>,
  options: ProviderRegistryOptions = {}
): FlightProvider[] {
  const providers: FlightProvider[] = [new MockProvider()];
  providers.push(new AmadeusProvider(parseAmadeusConfig(env), options));
  providers.push(new DuffelProvider(parseDuffelConfig(env), parseRealProviderConfig(env), options));
  return providers;
}

export function listEnabledProviders(providers: FlightProvider[]): FlightProvider[] {
  return providers.filter((provider) => provider.isEnabled());
}

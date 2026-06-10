import { parseAmadeusConfig } from "../config/amadeus.ts";
import { AmadeusProvider } from "./amadeus/amadeus-provider.ts";
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
  return providers;
}

export function listEnabledProviders(providers: FlightProvider[]): FlightProvider[] {
  return providers.filter((provider) => provider.isEnabled());
}


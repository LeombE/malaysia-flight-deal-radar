import { parseCachedProviderConfig } from "../config/cached-providers.ts";
import { parseRealProviderConfig } from "../config/real-providers.ts";
import { createCachedProviderRegistry } from "../providers/cached-registry.ts";
import { createProviderRegistry } from "../providers/registry.ts";
import { buildCachedProviderReadinessReports, buildProviderReadinessReports } from "../providers/readiness.ts";
import { handleAppRequest, type AppDependencies, type FlightRadarEnv } from "../routes/app.ts";
import type { ScanRunResult } from "../scanner/types.ts";
import { DemoRepository } from "./demo-repository.ts";
import { demoSchedulerConfig, runDemoScan } from "./demo-runner.ts";
import { createSeededDemoState, type DemoState } from "./demo-state.ts";

export interface DemoApp {
  state: DemoState;
  repository: DemoRepository;
  handle(request: Request): Promise<Response>;
}

export interface DemoAppOptions {
  env?: FlightRadarEnv;
  state?: DemoState;
  afterScan?: (state: DemoState, result: ScanRunResult) => void | Promise<void>;
}

function envStrings(env: FlightRadarEnv): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") output[key] = value;
  }
  return output;
}

export function createDemoApp(options: DemoAppOptions = {}): DemoApp {
  const state = options.state ?? createSeededDemoState();
  const env = options.env ?? {};
  const envVars = envStrings(env);
  const repository = new DemoRepository(state);
  const providers = createProviderRegistry(envVars, {
    fetch: async () => {
      throw new Error("Demo app must not make real provider network calls");
    },
    now: () => Date.parse(state.clock.nowIso),
    sleep: async () => {}
  });
  const cachedProviders = createCachedProviderRegistry(envVars, {
    fetch: async () => {
      throw new Error("Demo app must not make cached provider network calls");
    },
    now: () => Date.parse(state.clock.nowIso),
    sleep: async () => {}
  });
  const realProviderConfig = parseRealProviderConfig(envVars);
  const cachedProviderConfig = parseCachedProviderConfig(envVars);
  const providerReadiness = buildProviderReadinessReports({
    providers,
    env: envVars,
    config: realProviderConfig
  });
  providerReadiness.push(...buildCachedProviderReadinessReports({
    providers: cachedProviders,
    env: envVars,
    config: cachedProviderConfig
  }));
  const dependencies: AppDependencies = {
    apiRepository: repository,
    scanRepository: repository,
    providers,
    cachedProviders,
    schedulerConfig: demoSchedulerConfig,
    realProviderConfig,
    cachedProviderConfig,
    providerReadinessEnv: envVars,
    providerReadiness,
    now: () => new Date(state.clock.nowIso),
    runScan: async () => {
      const result = await runDemoScan(state);
      await options.afterScan?.(state, result);
      return result;
    }
  };

  return {
    state,
    repository,
    handle(request: Request): Promise<Response> {
      return handleAppRequest(request, env, dependencies);
    }
  };
}

export async function createScannedDemoApp(options: DemoAppOptions = {}): Promise<DemoApp> {
  const state = options.state ?? createSeededDemoState();
  if (state.dealScores.length === 0) {
    const result = await runDemoScan(state);
    await options.afterScan?.(state, result);
  }
  return createDemoApp({ ...options, state });
}

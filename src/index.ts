import { parseSchedulerConfig } from "./config/scheduler.ts";
import { D1ScanRepository } from "./db/d1-scan-repository.ts";
import { createProviderRegistry } from "./providers/registry.ts";
import { runScheduledScan } from "./scanner/scheduled-scan.ts";
import {
  createDefaultAppDependencies,
  handleAppRequest,
  type FlightRadarEnv
} from "./routes/app.ts";

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

function stringEnv(env: FlightRadarEnv): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") output[key] = value;
  }
  return output;
}

export default {
  fetch(request: Request, env: FlightRadarEnv): Promise<Response> {
    return handleAppRequest(request, env, createDefaultAppDependencies(env));
  },

  scheduled(_controller: unknown, env: FlightRadarEnv, ctx: ExecutionContextLike): void {
    if (!env.DB) {
      throw new Error("D1 DB binding is required");
    }
    const envVars = stringEnv(env);
    ctx.waitUntil(runScheduledScan({
      repository: new D1ScanRepository(env.DB),
      providers: createProviderRegistry(envVars),
      config: parseSchedulerConfig(envVars)
    }));
  }
};

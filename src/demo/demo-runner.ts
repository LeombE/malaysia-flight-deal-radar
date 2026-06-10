import type { SchedulerConfig } from "../config/scheduler.ts";
import { runScheduledScan } from "../scanner/scheduled-scan.ts";
import type { ScanRunResult } from "../scanner/types.ts";
import { DemoMockProvider } from "./demo-provider.ts";
import { DemoRepository } from "./demo-repository.ts";
import { demoIdFactory, type DemoState } from "./demo-state.ts";

export const demoSchedulerConfig: SchedulerConfig = {
  maxSearchesPerCronRun: 5,
  maxProviderConcurrency: 2,
  providerDailyBudget: 50,
  revalidateBeforeAlertMinutes: 30,
  defaultStayLengthDays: 5,
  departureOffsetDays: 45,
  providerFailureDegradeThreshold: 3
};

export async function runDemoScan(state: DemoState): Promise<ScanRunResult> {
  return runScheduledScan({
    repository: new DemoRepository(state),
    providers: [new DemoMockProvider(state.clock.nowIso)],
    config: demoSchedulerConfig,
    now: new Date(state.clock.nowIso),
    idFactory: demoIdFactory(state)
  });
}

import type { SchedulerConfig } from "../config/scheduler.ts";
import type { FlightProvider } from "../providers/types.ts";
import { runScheduledScan } from "../scanner/scheduled-scan.ts";
import type { ScanRepository, ScanRunResult } from "../scanner/types.ts";

export interface AdminScanEnv {
  ADMIN_TOKEN?: string;
}

export interface AdminScanDependencies {
  repository?: ScanRepository;
  providers?: FlightProvider[];
  config?: SchedulerConfig;
  runScan?: () => Promise<ScanRunResult>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export async function handleAdminScanRequest(
  request: Request,
  env: AdminScanEnv,
  dependencies: AdminScanDependencies
): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return jsonResponse({ ok: false, error: "admin_scan_disabled" }, 503);
  }

  const expected = `Bearer ${env.ADMIN_TOKEN}`;
  if (request.headers.get("Authorization") !== expected) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const result = dependencies.runScan
    ? await dependencies.runScan()
    : dependencies.repository && dependencies.providers && dependencies.config
      ? await runScheduledScan({
          repository: dependencies.repository,
          providers: dependencies.providers,
          config: dependencies.config
        })
      : null;

  if (!result) {
    return jsonResponse({ ok: false, error: "scan_dependencies_missing" }, 503);
  }

  return jsonResponse({ ok: true, result });
}

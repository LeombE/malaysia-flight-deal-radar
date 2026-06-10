import type { SchedulerConfig } from "../config/scheduler.ts";
import type { FlightProvider } from "../providers/types.ts";
import { runScheduledScan } from "../scanner/scheduled-scan.ts";
import type { ScanRepository } from "../scanner/types.ts";

export interface AdminScanEnv {
  ADMIN_TOKEN?: string;
}

export interface AdminScanDependencies {
  repository: ScanRepository;
  providers: FlightProvider[];
  config: SchedulerConfig;
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

  const result = await runScheduledScan(dependencies);
  return jsonResponse({ ok: true, result });
}


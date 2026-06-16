import { writeFileSync } from "node:fs";
import {
  fetchDeploymentHealthSnapshot,
  formatDeploymentHealthReport
} from "../src/reports/deployment-health-report.ts";

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const baseUrl = argValue("--base-url") ?? process.env.CF_DEMO_BASE_URL ?? process.env.WORKER_BASE_URL ?? "";
const outputPath = argValue("--output");

if (!baseUrl.trim()) {
  console.error("Worker base URL is required.");
  console.error("Use one of:");
  console.error("  npm run cf:demo:report:remote -- --base-url https://<your-worker>.<your-subdomain>.workers.dev");
  console.error("  $env:CF_DEMO_BASE_URL='https://<your-worker>.<your-subdomain>.workers.dev'; npm run cf:demo:report:remote");
  process.exit(1);
}

const snapshot = await fetchDeploymentHealthSnapshot({ baseUrl });
const report = formatDeploymentHealthReport(snapshot);

if (outputPath) {
  writeFileSync(outputPath, report, "utf8");
  console.log(`Wrote sanitized deployment health report: ${outputPath}`);
} else {
  console.log(report);
}


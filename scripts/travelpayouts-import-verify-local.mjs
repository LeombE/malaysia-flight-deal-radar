import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildTravelpayoutsImportVerifySql } from "../src/providers/travelpayouts/import-local.ts";
import { projectRoot, readDevVars } from "./demo-utils.mjs";
import { runWranglerD1Execute } from "./lib/run-wrangler-d1.mjs";

const env = await readDevVars();
const sqlFilePath = resolve(projectRoot, "smoke-output", "travelpayouts-import-verify-local.sql");
await mkdir(dirname(sqlFilePath), { recursive: true });
await writeFile(sqlFilePath, `${buildTravelpayoutsImportVerifySql()}\n`, "utf8");

console.log("Travelpayouts local import verification.");
console.log("Queries: provider counts, freshness counts, top KUL Travelpayouts prices, raw/payload/token column check.");

try {
  const result = await runWranglerD1Execute({
    cwd: projectRoot,
    databaseName: process.env.D1_DATABASE_NAME || "malaysia-flight-deal-radar",
    sqlFilePath,
    redactions: [env.TRAVELPAYOUTS_TOKEN]
  });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

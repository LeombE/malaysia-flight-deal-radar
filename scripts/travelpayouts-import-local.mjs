import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runTravelpayoutsImportLocal } from "../src/providers/travelpayouts/import-local.ts";
import { projectRoot, readDevVars } from "./demo-utils.mjs";
import { runWranglerD1Execute } from "./lib/run-wrangler-d1.mjs";

function parseArgs(argv) {
  const input = { target: "local" };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) continue;
    if (key === "--target") input.target = value;
    if (key === "--origin") input.originIata = value;
    if (key === "--destination") input.destinationIata = value;
    if (key === "--endpoint") input.endpoint = value;
    if (key === "--currency") input.currency = value;
    if (key === "--depart-date" || key === "--departure-date") input.departDate = value;
    if (key === "--return-date") input.returnDate = value;
    if (key === "--period-type") input.periodType = value;
    if (key === "--trip-duration") input.tripDuration = Number.parseInt(value, 10);
    if (key === "--limit") input.limit = Number.parseInt(value, 10);
    if (key === "--dry-run-import") input.dryRunImport = value;
    index += 1;
  }
  return input;
}

async function executeLocalD1(sql, env) {
  const sqlFilePath = resolve(projectRoot, "smoke-output", "travelpayouts-import-local.sql");
  await mkdir(dirname(sqlFilePath), { recursive: true });
  await writeFile(sqlFilePath, `${sql}\n`, "utf8");

  await runWranglerD1Execute({
    cwd: projectRoot,
    databaseName: process.env.D1_DATABASE_NAME || "malaysia-flight-deal-radar",
    sqlFilePath,
    redactions: [env.TRAVELPAYOUTS_TOKEN]
  });
}

const env = await readDevVars();
const result = await runTravelpayoutsImportLocal({
  env,
  input: parseArgs(process.argv.slice(2)),
  executeSql: (sql) => executeLocalD1(sql, env)
});

console.log(result.output);
process.exitCode = result.exitCode;

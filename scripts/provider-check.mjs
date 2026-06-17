import { buildProviderCheckReport, formatProviderCheckReport } from "../src/providers/provider-check.ts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { projectRoot, readDevVars } from "./demo-utils.mjs";

async function readLastSmokeRecords() {
  const records = [];
  for (const fileName of ["duffel-last-smoke.json", "travelpayouts-last-smoke.json"]) {
    try {
      const text = await readFile(resolve(projectRoot, "smoke-output", fileName), "utf8");
      records.push(JSON.parse(text));
    } catch (error) {
      if (error && error.code !== "ENOENT") throw error;
    }
  }
  return records;
}

const env = await readDevVars();
const records = buildProviderCheckReport({
  env,
  lastSmoke: await readLastSmokeRecords()
});

console.log(formatProviderCheckReport(records));

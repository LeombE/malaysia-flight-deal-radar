import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runTravelpayoutsSmoke, travelpayoutsSmokeStatusFromResult } from "../src/providers/travelpayouts/smoke.ts";
import { projectRoot, readDevVars } from "./demo-utils.mjs";

function parseArgs(argv) {
  const input = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) continue;
    if (key === "--origin") input.originIata = value;
    if (key === "--destination") input.destinationIata = value;
    if (key === "--departure-at") input.departureAt = value;
    if (key === "--depart-date") input.departDate = value;
    if (key === "--departure-date") input.departureDate = value;
    if (key === "--return-date") input.returnDate = value;
    if (key === "--trip-duration") input.tripDuration = Number.parseInt(value, 10);
    if (key === "--endpoint") input.endpoint = value;
    if (key === "--currency") input.currency = value;
    if (key === "--limit") input.limit = Number.parseInt(value, 10);
    index += 1;
  }
  return input;
}

async function writeLastSmoke(result) {
  const outputPath = resolve(projectRoot, "smoke-output", "travelpayouts-last-smoke.json");
  await mkdir(dirname(outputPath), { recursive: true });
  const record = travelpayoutsSmokeStatusFromResult(result, new Date().toISOString());
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

const env = await readDevVars();
const result = await runTravelpayoutsSmoke({
  env,
  input: parseArgs(process.argv.slice(2))
});
await writeLastSmoke(result);

console.log(result.output);
process.exitCode = result.exitCode;

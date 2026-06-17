import { buildProviderCheckReport, formatProviderCheckReport } from "../src/providers/provider-check.ts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { projectRoot, readDevVars } from "./demo-utils.mjs";

async function readTravelpayoutsLastSmoke() {
  try {
    const text = await readFile(resolve(projectRoot, "smoke-output", "travelpayouts-last-smoke.json"), "utf8");
    return [JSON.parse(text)];
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
    return [];
  }
}

const env = await readDevVars();
const records = buildProviderCheckReport({
  env,
  lastSmoke: await readTravelpayoutsLastSmoke()
}).filter((record) => record.provider_name === "travelpayouts");

console.log(formatProviderCheckReport(records));

import { buildProviderCheckReport, formatProviderCheckReport } from "../src/providers/provider-check.ts";
import { readDevVars } from "./demo-utils.mjs";

const env = await readDevVars();
const records = buildProviderCheckReport({ env });

console.log(formatProviderCheckReport(records));

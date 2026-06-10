import { runDuffelSmoke } from "../src/providers/duffel/smoke.ts";
import { readDevVars } from "./demo-utils.mjs";

function parseArgs(argv) {
  const input = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) continue;
    if (key === "--origin") input.originIata = value;
    if (key === "--destination") input.destinationIata = value;
    if (key === "--departure-date") input.departureDate = value;
    if (key === "--return-date") input.returnDate = value;
    index += 1;
  }
  return input;
}

const env = await readDevVars();
const result = await runDuffelSmoke({
  env,
  input: parseArgs(process.argv.slice(2))
});

console.log(result.output);
process.exitCode = result.exitCode;

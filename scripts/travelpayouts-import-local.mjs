import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { runTravelpayoutsImportLocal } from "../src/providers/travelpayouts/import-local.ts";
import { projectRoot, readDevVars } from "./demo-utils.mjs";

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

function runCommand(command, args) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      windowsHide: true,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolveCommand({ code, stdout, stderr }));
  });
}

async function executeLocalD1(sql) {
  const outputPath = resolve(projectRoot, "smoke-output", "travelpayouts-import-local.sql");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${sql}\n`, "utf8");

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const databaseName = process.env.D1_DATABASE_NAME || "malaysia-flight-deal-radar";
  const args = ["wrangler", "d1", "execute", databaseName, "--local", "--file", outputPath];
  const result = await runCommand(command, args);
  if (result.code !== 0) {
    throw new Error([
      `Local D1 import failed with exit code ${result.code}.`,
      `Command: ${command} ${args.join(" ")}`,
      "stderr:",
      result.stderr.trim() || "(empty)",
      "stdout:",
      result.stdout.trim() || "(empty)"
    ].join("\n"));
  }
}

const env = await readDevVars();
const result = await runTravelpayoutsImportLocal({
  env,
  input: parseArgs(process.argv.slice(2)),
  executeSql: executeLocalD1
});

console.log(result.output);
process.exitCode = result.exitCode;

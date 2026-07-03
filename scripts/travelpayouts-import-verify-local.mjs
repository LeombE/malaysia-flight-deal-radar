import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { buildTravelpayoutsImportVerifySql } from "../src/providers/travelpayouts/import-local.ts";
import { projectRoot } from "./demo-utils.mjs";

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

const outputPath = resolve(projectRoot, "smoke-output", "travelpayouts-import-verify-local.sql");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${buildTravelpayoutsImportVerifySql()}\n`, "utf8");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const databaseName = process.env.D1_DATABASE_NAME || "malaysia-flight-deal-radar";
const args = ["wrangler", "d1", "execute", databaseName, "--local", "--file", outputPath];
const result = await runCommand(command, args);

console.log("Travelpayouts local import verification.");
console.log("Queries: provider counts, freshness counts, top KUL Travelpayouts prices, raw/payload/token column check.");
if (result.stdout.trim()) console.log(result.stdout.trim());
if (result.stderr.trim()) console.error(result.stderr.trim());
process.exitCode = result.code === 0 ? 0 : 1;

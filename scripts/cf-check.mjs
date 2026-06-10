import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wranglerExamplePath = resolve(root, "wrangler.toml.example");
const gitignorePath = resolve(root, ".gitignore");

const requiredSnippets = [
  ["name = \"malaysia-flight-deal-radar-demo\"", "Worker demo name placeholder"],
  ["main = \"src/index.ts\"", "Worker entrypoint"],
  ["compatibility_date =", "compatibility date"],
  ["binding = \"DB\"", "D1 DB binding"],
  ["database_id = \"replace-with-your-d1-database-id\"", "D1 database placeholder"],
  ["preview_database_id = \"replace-with-your-preview-d1-database-id\"", "D1 preview placeholder"],
  ["[triggers]", "cron trigger section"],
  ["crons = [\"0 */6 * * *\"]", "cron trigger example"],
  ["ENABLE_REAL_PROVIDERS = \"false\"", "real providers disabled"],
  ["REAL_PROVIDER_DRY_RUN = \"true\"", "real provider dry-run enabled"],
  ["DEFAULT_REAL_PROVIDER = \"\"", "no default real provider"],
  ["MAX_REAL_PROVIDER_SEARCHES_PER_RUN = \"1\"", "low real-provider search limit"],
  ["MAX_REAL_PROVIDER_DAILY_BUDGET = \"1\"", "low real-provider daily budget"]
];

const forbiddenSnippets = [
  "ADMIN_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "DUFFEL_ACCESS_TOKEN",
  "AMADEUS_CLIENT_ID",
  "AMADEUS_CLIENT_SECRET",
  "SKYSCANNER_API_KEY",
  "duffel_test_",
  "duffel_live_",
  "Bearer "
];

const requiredGitignoreSnippets = [
  ".dev.vars",
  ".dev.vars.*",
  "!.dev.vars.example",
  ".env",
  ".env.*",
  ".wrangler/",
  "wrangler.toml",
  "demo-data/",
  "logs/",
  "smoke-output/"
];

const results = [];

function pass(label) {
  results.push({ ok: true, label });
}

function fail(label) {
  results.push({ ok: false, label });
}

if (!existsSync(wranglerExamplePath)) {
  fail("wrangler.toml.example exists");
} else {
  pass("wrangler.toml.example exists");
  const wranglerExample = readFileSync(wranglerExamplePath, "utf8");
  for (const [snippet, label] of requiredSnippets) {
    if (wranglerExample.includes(snippet)) pass(label);
    else fail(label);
  }
  for (const snippet of forbiddenSnippets) {
    if (wranglerExample.includes(snippet)) fail(`no secret marker in wrangler example: ${snippet}`);
    else pass(`no secret marker in wrangler example: ${snippet}`);
  }
}

if (!existsSync(gitignorePath)) {
  fail(".gitignore exists");
} else {
  pass(".gitignore exists");
  const gitignore = readFileSync(gitignorePath, "utf8");
  for (const snippet of requiredGitignoreSnippets) {
    if (gitignore.includes(snippet)) pass(`gitignore covers ${snippet}`);
    else fail(`gitignore covers ${snippet}`);
  }
}

const failures = results.filter((result) => !result.ok);

console.log("Cloudflare mock/demo deployment check");
for (const result of results) {
  console.log(`${result.ok ? "ok" : "fail"} - ${result.label}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} Cloudflare deployment check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nCloudflare deployment defaults look safe for mock/demo.");
}

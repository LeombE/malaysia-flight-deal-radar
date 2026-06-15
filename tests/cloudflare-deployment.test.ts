import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createScannedDemoApp } from "../src/demo/demo-app.ts";
import type { DealApiRecord, ProviderHealthApiRecord } from "../src/routes/api-types.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test("wrangler example contains safe mock/demo deployment defaults and no secrets", () => {
  const text = readText("wrangler.toml.example");

  assert.match(text, /name = "malaysia-flight-deal-radar-demo"/);
  assert.match(text, /main = "src\/index\.ts"/);
  assert.match(text, /compatibility_date = "/);
  assert.match(text, /binding = "DB"/);
  assert.match(text, /database_id = "replace-with-your-d1-database-id"/);
  assert.match(text, /preview_database_id = "replace-with-your-preview-d1-database-id"/);
  assert.match(text, /\[triggers\]/);
  assert.match(text, /crons = \["0 \*\/6 \* \* \*"\]/);
  assert.match(text, /ENABLE_REAL_PROVIDERS = "false"/);
  assert.match(text, /REAL_PROVIDER_DRY_RUN = "true"/);
  assert.match(text, /DEFAULT_REAL_PROVIDER = ""/);
  assert.match(text, /MAX_REAL_PROVIDER_SEARCHES_PER_RUN = "1"/);
  assert.match(text, /MAX_REAL_PROVIDER_DAILY_BUDGET = "1"/);

  for (const forbidden of [
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
  ]) {
    assert.equal(text.includes(forbidden), false, `${forbidden} must not appear in wrangler.toml.example`);
  }
});

test("Cloudflare helper scripts are available without real provider credentials", () => {
  const packageJson = JSON.parse(readText("package.json")) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts["cf:check"], "node scripts/cf-check.mjs");
  assert.equal(packageJson.scripts["cf:dev"], "npx wrangler dev");
  assert.equal(packageJson.scripts["cf:d1:create:note"], "node scripts/cf-d1-create-note.mjs");
  assert.equal(packageJson.scripts["cf:d1:migrate:local"], "npx wrangler d1 migrations apply malaysia-flight-deal-radar --local");
  assert.equal(packageJson.scripts["cf:d1:migrate:remote"], "npx wrangler d1 migrations apply malaysia-flight-deal-radar --remote");
  assert.equal(packageJson.scripts["cf:demo:seed:local"], "npx wrangler d1 execute malaysia-flight-deal-radar --local --file scripts/sql/remote-demo-baseline-seed.sql");
  assert.equal(packageJson.scripts["cf:demo:seed:remote"], "npx wrangler d1 execute malaysia-flight-deal-radar --remote --file scripts/sql/remote-demo-baseline-seed.sql");
  assert.equal(packageJson.scripts["cf:demo:verify:remote"], "npx wrangler d1 execute malaysia-flight-deal-radar --remote --file scripts/sql/remote-demo-baseline-verify.sql");
  assert.equal(packageJson.scripts["cf:deploy:dry"], "npx wrangler deploy --dry-run");
  assert.equal(packageJson.scripts["cf:deploy"], "npx wrangler deploy");
});

test("local Cloudflare runtime state is ignored while examples stay trackable", () => {
  const text = readText(".gitignore");

  assert.match(text, /\.wrangler\//);
  assert.match(text, /wrangler\.toml/);
  assert.match(text, /\.dev\.vars/);
  assert.match(text, /!\.dev\.vars\.example/);
  assert.match(text, /\.env/);
  assert.match(text, /demo-data\//);
  assert.match(text, /logs\//);
  assert.match(text, /smoke-output\//);
});

test("deployment smoke checklist documents mock-only expectations and token safety", () => {
  const text = readText("docs/deployment_smoke_checklist.md");

  assert.match(text, /mock` is enabled/);
  assert.match(text, /duffel` is disabled/);
  assert.match(text, /ADMIN_TOKEN/);
  assert.match(text, /no token value is echoed/);
  assert.match(text, /DUFFEL_ACCESS_TOKEN` is set in Cloudflare/);
  assert.match(text, /REAL_PROVIDER_DRY_RUN=true/);
  assert.match(text, /Skyscanner has not been added/);
});

test("mock-only deployment API smoke works without real network calls", async () => {
  const app = await createScannedDemoApp({
    env: {
      ENABLE_REAL_PROVIDERS: "false",
      REAL_PROVIDER_DRY_RUN: "true",
      DEFAULT_REAL_PROVIDER: ""
    }
  });
  const healthResponse = await app.handle(new Request("https://demo.test/health"));
  const providerResponse = await app.handle(new Request("https://demo.test/api/provider-health"));
  const dealsResponse = await app.handle(new Request("https://demo.test/api/deals"));
  const dashboardResponse = await app.handle(new Request("https://demo.test/dashboard"));
  const providers = await json<{ providers: ProviderHealthApiRecord[] }>(providerResponse);
  const deals = await json<{ deals: DealApiRecord[] }>(dealsResponse);
  const dashboard = await dashboardResponse.text();
  const serialized = JSON.stringify({ providers, deals, dashboard });

  assert.equal(healthResponse.status, 200);
  assert.equal(providerResponse.status, 200);
  assert.equal(dealsResponse.status, 200);
  assert.equal(dashboardResponse.status, 200);
  assert.ok(providers.providers.find((provider) => provider.provider_name === "mock" && provider.enabled));
  assert.ok(providers.providers.find((provider) => provider.provider_name === "amadeus" && !provider.enabled));
  assert.ok(providers.providers.find((provider) => provider.provider_name === "duffel" && !provider.enabled));
  assert.ok(deals.deals.length > 0);
  assert.match(dashboard, /Malaysia Flight Deal Radar/);
  assert.equal(serialized.includes("DUFFEL_ACCESS_TOKEN"), false);
  assert.equal(serialized.includes("rawPayload"), false);
});

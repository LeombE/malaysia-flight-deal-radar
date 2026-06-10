import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";
import { createScannedDemoApp } from "../src/demo/demo-app.ts";
import type { DealApiRecord } from "../src/routes/api-types.ts";

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test("Worker entrypoint can be imported for Cloudflare runtime", () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");
});

test("local demo /health returns ok without real provider network calls", async () => {
  const app = await createScannedDemoApp();
  const response = await app.handle(new Request("https://demo.test/health"));
  const body = await json<{
    ok: boolean;
    status: string;
    providers: Array<{ provider_name: string; status: string; enabled: boolean }>;
  }>(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "ok");
  assert.equal(body.providers.some((provider) => provider.provider_name === "mock"), true);
  assert.equal(body.providers.some((provider) => provider.provider_name === "amadeus" && provider.enabled === false), true);
});

test("local demo dashboard renders seeded deal HTML", async () => {
  const app = await createScannedDemoApp();
  const response = await app.handle(new Request("https://demo.test/dashboard"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Malaysia Flight Deal Radar/);
  assert.match(html, /KUL/);
  assert.match(html, /BKK/);
  assert.match(html, /RM/);
});

test("local demo /api/deals returns no_deal, suspected_deal, and strong_deal examples", async () => {
  const app = await createScannedDemoApp();
  const response = await app.handle(new Request("https://demo.test/api/deals"));
  const body = await json<{ deals: DealApiRecord[] }>(response);
  const labels = new Set(body.deals.map((deal) => deal.deal_label));

  assert.equal(response.status, 200);
  assert.ok(body.deals.length >= 5);
  assert.equal(labels.has("no_deal"), true);
  assert.equal(labels.has("suspected_deal"), true);
  assert.equal(labels.has("strong_deal"), true);
  assert.equal(JSON.stringify(body).includes("revalidationPayload"), false);
});

test("local demo generated state file is not required for unit tests", async () => {
  const app = await createScannedDemoApp();
  const response = await app.handle(new Request("https://demo.test/api/deals?deal_label=strong_deal"));
  const body = await json<{ deals: DealApiRecord[] }>(response);

  assert.equal(response.status, 200);
  assert.ok(body.deals.length > 0);
  assert.equal(body.deals.every((deal) => deal.deal_label === "strong_deal"), true);
});

test("local demo dashboard includes polished freshness labels and no raw provider payload", async () => {
  const app = await createScannedDemoApp();
  const response = await app.handle(new Request("https://demo.test/dashboard?min_score=0&deal_label=strong_deal"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Baseline median/);
  assert.equal(html.includes("Baseline RM"), false);
  assert.match(html, /Historical p10/);
  assert.match(html, /Last verified/);
  assert.match(html, /Deal label/);
  assert.match(html, /Provider/);
  assert.match(html, /Freshly verified/);
  assert.match(html, /name="min_score" value="0"/);
  assert.match(html, /<option value="strong_deal" selected>/);
  assert.equal(html.includes("revalidationPayload"), false);
  assert.equal(html.includes("rawPayload"), false);
});

test("local demo admin scan rejects missing and wrong token", async () => {
  const withoutToken = await createScannedDemoApp();
  const disabled = await withoutToken.handle(new Request("https://demo.test/api/admin/scan", { method: "POST" }));
  assert.equal(disabled.status, 503);

  const withToken = await createScannedDemoApp({ env: { ADMIN_TOKEN: "local-demo-token" } });
  const wrongToken = await withToken.handle(new Request("https://demo.test/api/admin/scan", {
    method: "POST",
    headers: {
      Authorization: "Bearer wrong-token"
    }
  }));
  assert.equal(wrongToken.status, 401);
});

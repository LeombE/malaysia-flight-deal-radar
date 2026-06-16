import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchDeploymentHealthSnapshot,
  formatDeploymentHealthReport,
  sanitizeReportText
} from "../src/reports/deployment-health-report.ts";
import type { DealApiRecord, ProviderHealthApiRecord } from "../src/routes/api-types.ts";

const GENERATED_AT = "2026-06-16T00:00:00.000Z";

function deal(overrides: Partial<DealApiRecord>): DealApiRecord {
  return {
    origin: "KUL",
    destination: "BKK",
    departure_date: "2026-07-25",
    return_date: "2026-07-30",
    stay_length_days: 5,
    amount_minor_myr: 44_100,
    display_price_rm: "RM441.00",
    baseline_median_minor_myr: 63_000,
    historical_p10_minor_myr: 50_000,
    discount_pct: 30,
    deal_score: 90,
    deal_label: "strong_deal",
    carrier: "MH",
    stops: 0,
    total_duration_minutes: 360,
    provider_name: "mock",
    last_revalidated_at: "2026-06-10T08:00:00.000Z",
    expires_at: null,
    alert_status: null,
    warning: null,
    is_live: true,
    ...overrides
  };
}

function provider(overrides: Partial<ProviderHealthApiRecord>): ProviderHealthApiRecord {
  return {
    provider_name: "mock",
    retention_mode: "RAW_ALLOWED",
    daily_budget: 50,
    used_today: 5,
    remaining_budget: 45,
    health_status: "healthy",
    last_success_at: "2026-06-10T08:00:00.000Z",
    last_failure_at: null,
    failure_count: 0,
    enabled: true,
    status: "healthy",
    checked_at: "2026-06-10T08:00:00.000Z",
    message: null,
    retry_after_ms: null,
    readiness: {
      provider_name: "mock",
      is_mock_provider: true,
      demo_ready: true,
      credentials_required: false,
      credentials_configured: true,
      test_mode: false,
      enabled: true,
      real_providers_enabled: false,
      dry_run_enabled: false,
      default_provider_selected: false,
      retention_mode: "RAW_ALLOWED",
      daily_budget: 0,
      used_today: 0,
      remaining_budget: 0,
      timeout_ms: 10_000,
      retry_limit: 2,
      revalidate_before_display_minutes: 15,
      revalidate_before_alert_minutes: 30,
      can_search_live: false,
      can_revalidate_live: false,
      blocking_reasons: []
    },
    ...overrides
  };
}

function mockProviders(): ProviderHealthApiRecord[] {
  return [
    provider({ provider_name: "mock", enabled: true, status: "healthy" }),
    provider({
      provider_name: "amadeus",
      retention_mode: "NO_CACHE",
      enabled: false,
      status: "disabled",
      readiness: {
        ...provider({}).readiness!,
        provider_name: "amadeus",
        is_mock_provider: false,
        demo_ready: false,
        credentials_required: true,
        credentials_configured: false,
        enabled: false,
        dry_run_enabled: true,
        retention_mode: "NO_CACHE",
        can_search_live: false,
        can_revalidate_live: false,
        blocking_reasons: ["real_providers_disabled", "dry_run_enabled", "credentials_missing"]
      }
    }),
    provider({
      provider_name: "duffel",
      retention_mode: "NO_CACHE",
      enabled: false,
      status: "disabled",
      message: "DUFFEL_ACCESS_TOKEN=duffel_test_secret_token",
      readiness: {
        ...provider({}).readiness!,
        provider_name: "duffel",
        is_mock_provider: false,
        demo_ready: false,
        credentials_required: true,
        credentials_configured: false,
        enabled: false,
        dry_run_enabled: true,
        retention_mode: "NO_CACHE",
        can_search_live: false,
        can_revalidate_live: false,
        blocking_reasons: ["real_providers_disabled", "dry_run_enabled", "credentials_missing"]
      }
    })
  ];
}

function mockDeals(): DealApiRecord[] {
  return [
    deal({ origin: "SZB", destination: "NRT", deal_label: "strong_deal", deal_score: 94, display_price_rm: "RM453.00", baseline_median_minor_myr: 70_000, discount_pct: 35.29 }),
    deal({ origin: "KUL", destination: "BKK", deal_label: "strong_deal", deal_score: 90 }),
    deal({ origin: "KUL", destination: "TPE", deal_label: "suspected_deal", deal_score: 71, display_price_rm: "RM459.00", baseline_median_minor_myr: 58_000, discount_pct: 20.86 }),
    deal({ origin: "JHB", destination: "BKK", deal_label: "suspected_deal", deal_score: 70, display_price_rm: "RM440.00", baseline_median_minor_myr: 55_000, discount_pct: 20 }),
    deal({ origin: "KUL", destination: "SIN", deal_label: "no_deal", deal_score: 0, display_price_rm: "RM454.00", baseline_median_minor_myr: 50_000, discount_pct: 9.2 }),
    deal({ origin: "JHB", destination: "SIN", deal_label: "no_deal", deal_score: 0 }),
    deal({ origin: "KUL", destination: "DMK", deal_label: "no_deal", deal_score: 0 }),
    deal({ origin: "KUL", destination: "HKT", deal_label: "no_deal", deal_score: 0 }),
    deal({ origin: "SZB", destination: "KIX", deal_label: "no_deal", deal_score: 0 })
  ];
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

test("deployment report fetches read-only endpoints with mocked HTTP", async () => {
  const calls: string[] = [];
  const deals = mockDeals();
  const providers = mockProviders();
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/health") {
      return response({
        ok: true,
        status: "ok",
        checked_at: GENERATED_AT,
        providers: providers.map((item) => ({
          provider_name: item.provider_name,
          enabled: item.enabled,
          status: item.status
        }))
      });
    }
    if (url.pathname === "/api/provider-health") {
      return response({ ok: true, providers });
    }
    if (url.pathname === "/api/deals" && url.searchParams.get("deal_label") === "strong_deal") {
      return response({ ok: true, deals: deals.filter((item) => item.deal_label === "strong_deal") });
    }
    if (url.pathname === "/api/deals" && url.searchParams.get("deal_label") === "suspected_deal") {
      return response({ ok: true, deals: deals.filter((item) => item.deal_label === "suspected_deal") });
    }
    if (url.pathname === "/api/deals") {
      return response({ ok: true, deals });
    }
    return new Response("not found", { status: 404 });
  };

  const snapshot = await fetchDeploymentHealthSnapshot({
    baseUrl: "https://worker.example",
    fetchImpl,
    generatedAt: GENERATED_AT
  });

  assert.deepEqual(calls.sort(), [
    "/api/deals",
    "/api/deals?deal_label=strong_deal",
    "/api/deals?deal_label=suspected_deal",
    "/api/provider-health",
    "/health"
  ].sort());
  assert.equal(snapshot.deals.length, 9);
  assert.equal(snapshot.strongDeals.length, 2);
  assert.equal(snapshot.suspectedDeals.length, 2);
});

test("deployment report summarizes counts and provider readiness", async () => {
  const snapshot = {
    baseUrl: "https://worker.example",
    generatedAt: GENERATED_AT,
    health: { ok: true, status: "ok" },
    providerHealth: { ok: true, providers: mockProviders() },
    deals: mockDeals(),
    strongDeals: mockDeals().filter((item) => item.deal_label === "strong_deal"),
    suspectedDeals: mockDeals().filter((item) => item.deal_label === "suspected_deal")
  };
  const report = formatDeploymentHealthReport(snapshot);

  assert.match(report, /Health status: ok \(ok\)/);
  assert.match(report, /Mock provider healthy: yes/);
  assert.match(report, /Real providers disabled: yes/);
  assert.match(report, /\| mock \| demo_provider \| true \| healthy \| false \| none \|/);
  assert.match(report, /\| amadeus \| real_provider \| false \| disabled \| false \| real_providers_disabled, dry_run_enabled, credentials_missing \|/);
  assert.match(report, /\| strong_deal \| 2 \|/);
  assert.match(report, /\| suspected_deal \| 2 \|/);
  assert.match(report, /\| no_deal \| 5 \|/);
  assert.match(report, /SZB -> NRT/);
  assert.match(report, /KUL -> TPE/);
});

test("deployment report output redacts secret names and token-shaped values", () => {
  const redacted = sanitizeReportText([
    "ADMIN_TOKEN",
    "DUFFEL_ACCESS_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "duffel_test_secret_token",
    "Bearer secret-token",
    "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  ].join("\n"));

  assert.equal(redacted.includes("ADMIN_TOKEN"), false);
  assert.equal(redacted.includes("DUFFEL_ACCESS_TOKEN"), false);
  assert.equal(redacted.includes("TELEGRAM_BOT_TOKEN"), false);
  assert.equal(redacted.includes("TELEGRAM_CHAT_ID"), false);
  assert.equal(redacted.includes("duffel_test_secret_token"), false);
  assert.equal(redacted.includes("Bearer secret-token"), false);
  assert.equal(redacted.includes("123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ"), false);
});


import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAlertEligibility } from "../src/alerts/eligibility.ts";
import { formatTelegramDealMessage } from "../src/alerts/telegram-format.ts";
import { TelegramSender } from "../src/alerts/telegram-sender.ts";
import { parseTelegramConfig } from "../src/config/telegram.ts";
import type { ProviderOffer } from "../src/providers/types.ts";
import type { DealLabel, DealScoreResult } from "../src/scoring/types.ts";

const NOW = new Date("2026-06-10T08:00:00.000Z");

function offer(overrides: Partial<ProviderOffer> = {}): ProviderOffer {
  return {
    provider: "mock",
    providerOfferId: "offer-1",
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06",
    cabinClass: "economy",
    adultCount: 1,
    price: { amountMinor: 70_000, currency: "MYR" },
    itineraries: [],
    totalStops: 0,
    carriers: ["MH"],
    durationMinutes: 360,
    lastVerifiedAt: NOW.toISOString(),
    retentionMode: "RAW_ALLOWED",
    display: {
      canAlert: true,
      canDisplay: true,
      requiresRevalidation: false
    },
    ...overrides
  };
}

function score(label: DealLabel, overrides: Partial<DealScoreResult> = {}): DealScoreResult {
  return {
    current_price_myr: "700.00",
    historical_median_myr: "1000.00",
    historical_p10_myr: "650.00",
    amount_minor_myr: 70_000,
    baseline_median_minor_myr: 100_000,
    historical_p10_minor_myr: 65_000,
    sample_size: 20,
    discount_pct: 30,
    score: label === "strong_deal" ? 85 : label === "suspected_deal" ? 70 : 0,
    deal_label: label,
    alert_eligible: label === "strong_deal" || label === "suspected_deal",
    reasons: [],
    quality_penalty: 0,
    ...overrides
  };
}

function eligibility(label: DealLabel, options: {
  offer?: ProviderOffer;
  score?: Partial<DealScoreResult>;
  previousSentAt?: string;
  recentlyRevalidated?: boolean;
} = {}) {
  const baseOffer = options.offer ?? offer();
  return evaluateAlertEligibility({
    offer: baseOffer,
    score: score(label, options.score),
    now: NOW,
    recentlyRevalidated: options.recentlyRevalidated ?? true,
    revalidateBeforeAlertMinutes: 30,
    cooldownHours: 24,
    previousAlerts: options.previousSentAt
      ? [{
          originIata: baseOffer.originIata,
          destinationIata: baseOffer.destinationIata,
          departureDate: baseOffer.departureDate,
          returnDate: baseOffer.returnDate,
          provider: baseOffer.provider,
          dealLabel: label,
          sentAt: options.previousSentAt
        }]
      : []
  });
}

test("missing Telegram config disables sending safely", async () => {
  const sender = new TelegramSender(parseTelegramConfig({}));
  const result = await sender.sendMessage("hello");
  assert.equal(result.status, "disabled");
  assert.equal(result.errorCode, "telegram_not_configured");
});

test("eligible strong_deal and suspected_deal pass eligibility", () => {
  assert.equal(eligibility("strong_deal").eligible, true);
  assert.equal(eligibility("suspected_deal").eligible, true);
});

test("non-alertable labels are rejected", () => {
  for (const label of ["no_deal", "watched_price", "urgent_revalidate", "expired"] as DealLabel[]) {
    const result = eligibility(label);
    assert.equal(result.eligible, false);
    assert.equal(result.reasons.some((reason) => reason.startsWith("label_not_alertable")), true);
  }
});

test("expired and stale offers are rejected", () => {
  assert.equal(eligibility("strong_deal", {
    offer: offer({ expiresAt: "2026-06-10T07:59:59.000Z" })
  }).reasons.includes("offer_expired"), true);

  assert.equal(eligibility("strong_deal", {
    offer: offer({ lastVerifiedAt: "2026-06-10T06:00:00.000Z" })
  }).reasons.includes("stale_revalidation"), true);

  assert.equal(eligibility("strong_deal", { recentlyRevalidated: false }).reasons.includes("not_recently_revalidated"), true);
});

test("missing essentials and non-MYR price are rejected", () => {
  const result = eligibility("strong_deal", {
    offer: offer({
      originIata: "",
      price: { amountMinor: 0, currency: "USD" },
      carriers: []
    })
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reasons.includes("missing_origin"), true);
  assert.equal(result.reasons.includes("missing_price"), true);
  assert.equal(result.reasons.includes("price_not_myr"), true);
  assert.equal(result.reasons.includes("missing_carrier"), true);
});

test("duplicate alert is skipped within cooldown and allowed after cooldown", () => {
  const duplicate = eligibility("strong_deal", { previousSentAt: "2026-06-10T07:00:00.000Z" });
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.eligible, false);

  const outsideCooldown = eligibility("strong_deal", { previousSentAt: "2026-06-08T07:00:00.000Z" });
  assert.equal(outsideCooldown.eligible, true);
});

test("Telegram message includes required fields and warning", () => {
  const message = formatTelegramDealMessage({
    offer: offer(),
    score: score("strong_deal"),
    stayLengthDays: 5
  });
  assert.match(message, /Strong flight deal found/);
  assert.match(message, /KUL → BKK/);
  assert.match(message, /Depart: 2026\\-10\\-01/);
  assert.match(message, /Return: 2026\\-10\\-06/);
  assert.match(message, /Price: RM700\\.00/);
  assert.match(message, /Median: RM1000\\.00/);
  assert.match(message, /Discount: 30%/);
  assert.match(message, /Score: 85/);
  assert.match(message, /Provider: mock/);
  assert.match(message, /Warning: price can change/);
});

test("deep link appears only when freshly revalidated and display is allowed", () => {
  const allowed = formatTelegramDealMessage({
    offer: offer({ deepLink: "https://example.com/deal" }),
    score: score("strong_deal"),
    stayLengthDays: 5
  });
  assert.match(allowed, /https:\/\/example\\.com\/deal/);

  const blocked = formatTelegramDealMessage({
    offer: offer({
      deepLink: "https://example.com/deal",
      display: { canAlert: false, canDisplay: false, requiresRevalidation: true }
    }),
    score: score("strong_deal"),
    stayLengthDays: 5
  });
  assert.equal(blocked.includes("https://example"), false);
});

test("Telegram sender uses mocked HTTP and sends message", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async (_url, init) => {
    called = true;
    const body = JSON.parse(String(init?.body)) as { chat_id: string; text: string; parse_mode: string };
    assert.equal(body.chat_id, "chat-1");
    assert.equal(body.parse_mode, "MarkdownV2");
    assert.match(body.text, /hello/);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
  };

  const sender = new TelegramSender(parseTelegramConfig({
    TELEGRAM_BOT_TOKEN: "secret-token",
    TELEGRAM_CHAT_ID: "chat-1"
  }), { fetch: fetchImpl });
  const result = await sender.sendMessage("hello");
  assert.equal(called, true);
  assert.equal(result.status, "sent");
  assert.equal(result.messageId, 42);
});

test("Telegram send failure is sanitized and token is never logged", async () => {
  const logs: string[] = [];
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 500 });
  const sender = new TelegramSender(parseTelegramConfig({
    TELEGRAM_BOT_TOKEN: "super-secret-token",
    TELEGRAM_CHAT_ID: "chat-1",
    TELEGRAM_MAX_RETRY_ATTEMPTS: "1"
  }), {
    fetch: fetchImpl,
    sleep: async () => {},
    logger: {
      log: (_event, fields) => logs.push(JSON.stringify(fields))
    }
  });

  const result = await sender.sendMessage("hello");
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "telegram_http_500");
  assert.equal(JSON.stringify(result).includes("super-secret-token"), false);
  assert.equal(logs.join("\n").includes("super-secret-token"), false);
});


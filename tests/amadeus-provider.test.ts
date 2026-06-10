import test from "node:test";
import assert from "node:assert/strict";
import { parseAmadeusConfig } from "../src/config/amadeus.ts";
import { AmadeusProvider, clearAmadeusTokenCache } from "../src/providers/amadeus/index.ts";
import { createProviderRegistry, listEnabledProviders } from "../src/providers/registry.ts";
import type { ProviderOffer } from "../src/providers/types.ts";

interface MockCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

function tokenBody(token = "token-a", expiresIn = 1_799): unknown {
  return {
    type: "amadeusOAuth2Token",
    token_type: "Bearer",
    access_token: token,
    expires_in: expiresIn,
    state: "approved"
  };
}

function flightOffer(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: "flight-offer",
    id: "offer-1",
    source: "GDS",
    price: {
      currency: "MYR",
      total: "499.90"
    },
    itineraries: [
      {
        duration: "PT6H30M",
        segments: [
          {
            departure: { iataCode: "KUL", at: "2026-10-01T08:00:00" },
            arrival: { iataCode: "BKK", at: "2026-10-01T09:10:00" },
            carrierCode: "MH",
            number: "780",
            duration: "PT2H10M",
            numberOfStops: 0
          }
        ]
      },
      {
        duration: "PT6H45M",
        segments: [
          {
            departure: { iataCode: "BKK", at: "2026-10-06T18:00:00" },
            arrival: { iataCode: "KUL", at: "2026-10-06T21:15:00" },
            carrierCode: "MH",
            operating: { carrierCode: "MH" },
            number: "781",
            duration: "PT2H15M",
            numberOfStops: 0
          }
        ]
      }
    ],
    ...overrides
  };
}

function makeProvider(
  fetchImpl: typeof fetch,
  options: { now?: () => number; sleep?: (ms: number) => Promise<void>; env?: Record<string, string> } = {}
): AmadeusProvider {
  return new AmadeusProvider(
    parseAmadeusConfig({
      AMADEUS_CLIENT_ID: "client-id",
      AMADEUS_CLIENT_SECRET: "client-secret",
      AMADEUS_BASE_URL: "https://test.api.amadeus.com",
      AMADEUS_MAX_RETRY_ATTEMPTS: "2",
      AMADEUS_RETRY_BASE_DELAY_MS: "1",
      AMADEUS_RETRY_MAX_DELAY_MS: "2",
      AMADEUS_MIN_REQUEST_INTERVAL_MS: "0",
      ...options.env
    }),
    {
      fetch: fetchImpl,
      now: options.now ?? (() => Date.parse("2026-06-10T00:00:00.000Z")),
      sleep: options.sleep ?? (async () => {})
    }
  );
}

test("AmadeusProvider is disabled unless both credentials are present", async () => {
  clearAmadeusTokenCache();
  const provider = new AmadeusProvider(parseAmadeusConfig({}));
  assert.equal(provider.isEnabled(), false);
  assert.deepEqual(await provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  }), []);
  assert.equal((await provider.getProviderHealth()).status, "disabled");
});

test("OAuth uses form encoding and sanitized errors do not expose secrets", async () => {
  clearAmadeusTokenCache();
  const calls: MockCall[] = [];
  const provider = makeProvider(async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ error: "invalid_client" }, 401);
  });

  await assert.rejects(
    provider.searchRoundTripOffers({
      originIata: "KUL",
      destinationIata: "BKK",
      departureDate: "2026-10-01",
      returnDate: "2026-10-06"
    }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(message.includes("client-secret"), false);
      assert.equal(message.includes("client-id"), false);
      return true;
    }
  );

  assert.equal(calls[0]?.url, "https://test.api.amadeus.com/v1/security/oauth2/token");
  assert.equal((calls[0]?.init?.headers as Record<string, string>)["Content-Type"], "application/x-www-form-urlencoded");
  assert.match(String(calls[0]?.init?.body), /grant_type=client_credentials/);
});

test("token cache reuses valid token and refreshes near expiry", async () => {
  clearAmadeusTokenCache();
  let now = Date.parse("2026-06-10T00:00:00.000Z");
  let tokenRequests = 0;
  const calls: MockCall[] = [];
  const provider = makeProvider(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/oauth2/token")) {
      tokenRequests += 1;
      return jsonResponse(tokenBody(`token-${tokenRequests}`, 120));
    }
    return jsonResponse({ data: [flightOffer()] });
  }, { now: () => now });

  const input = {
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  };

  await provider.searchRoundTripOffers(input);
  await provider.searchRoundTripOffers(input);
  assert.equal(tokenRequests, 1);

  now += 70_000;
  await provider.searchRoundTripOffers(input);
  assert.equal(tokenRequests, 2);

  const authHeaders = calls
    .filter((call) => call.url.includes("/flight-offers"))
    .map((call) => new Headers(call.init?.headers).get("Authorization"));
  assert.equal(authHeaders[0], "Bearer token-1");
  assert.equal(authHeaders.at(-1), "Bearer token-2");
});

test("concurrent calls coalesce token refresh", async () => {
  clearAmadeusTokenCache();
  let tokenRequests = 0;
  let releaseToken!: () => void;
  const tokenGate = new Promise<void>((resolve) => {
    releaseToken = resolve;
  });
  const provider = makeProvider(async (url) => {
    if (String(url).includes("/oauth2/token")) {
      tokenRequests += 1;
      await tokenGate;
      return jsonResponse(tokenBody("shared-token"));
    }
    return jsonResponse({ data: [flightOffer()] });
  });

  const input = {
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  };
  const first = provider.searchRoundTripOffers(input);
  const second = provider.searchRoundTripOffers(input);
  releaseToken();
  await Promise.all([first, second]);
  assert.equal(tokenRequests, 1);
});

test("search request includes round-trip economy MYR parameters", async () => {
  clearAmadeusTokenCache();
  const calls: MockCall[] = [];
  const provider = makeProvider(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/oauth2/token")) return jsonResponse(tokenBody("token"));
    return jsonResponse({ data: [flightOffer()] });
  });

  await provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06",
    adults: 1
  });

  const searchCall = calls.find((call) => call.url.includes("/v2/shopping/flight-offers"));
  assert.ok(searchCall);
  const url = new URL(searchCall.url);
  assert.equal(url.searchParams.get("originLocationCode"), "KUL");
  assert.equal(url.searchParams.get("destinationLocationCode"), "BKK");
  assert.equal(url.searchParams.get("departureDate"), "2026-10-01");
  assert.equal(url.searchParams.get("returnDate"), "2026-10-06");
  assert.equal(url.searchParams.get("adults"), "1");
  assert.equal(url.searchParams.get("travelClass"), "ECONOMY");
  assert.equal(url.searchParams.get("currencyCode"), "MYR");
});

test("valid search response normalizes into ProviderOffer", async () => {
  clearAmadeusTokenCache();
  const provider = makeProvider(async (url) => {
    if (String(url).includes("/oauth2/token")) return jsonResponse(tokenBody("token"));
    return jsonResponse({ data: [flightOffer()] });
  });

  const offers = await provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  });

  assert.equal(offers.length, 1);
  const offer = offers[0] as ProviderOffer;
  assert.equal(offer.provider, "amadeus");
  assert.equal(offer.price.amountMinor, 49_990);
  assert.equal(offer.price.currency, "MYR");
  assert.deepEqual(offer.carriers, ["MH"]);
  assert.equal(offer.display.requiresRevalidation, true);
  assert.equal(offer.display.canAlert, false);
  assert.equal(offer.retentionMode, "NO_CACHE");
});

test("non-MYR and malformed responses are rejected safely", async () => {
  clearAmadeusTokenCache();
  const nonMyrProvider = makeProvider(async (url) => {
    if (String(url).includes("/oauth2/token")) return jsonResponse(tokenBody("token"));
    return jsonResponse({ data: [flightOffer({ price: { currency: "USD", total: "99.00" } })] });
  });
  const offers = await nonMyrProvider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  });
  assert.equal(offers.length, 0);

  clearAmadeusTokenCache();
  const malformedProvider = makeProvider(async (url) => {
    if (String(url).includes("/oauth2/token")) return jsonResponse(tokenBody("token"));
    return jsonResponse({ data: { not: "an array" } });
  });
  await assert.rejects(malformedProvider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  }), /Invalid Amadeus Flight Offers Search response/);
});

test("revalidation calls Flight Offers Price and enables alert/display only after pricing", async () => {
  clearAmadeusTokenCache();
  const calls: MockCall[] = [];
  const provider = makeProvider(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/oauth2/token")) return jsonResponse(tokenBody("token"));
    if (String(url).includes("/pricing")) {
      return jsonResponse({ data: { type: "flight-offers-pricing", flightOffers: [flightOffer({ id: "offer-priced" })] } });
    }
    return jsonResponse({ data: [flightOffer()] });
  });

  const [offer] = await provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  });
  assert.ok(offer);
  const revalidated = await provider.revalidateOffer({
    providerOfferId: offer.providerOfferId,
    originIata: offer.originIata,
    destinationIata: offer.destinationIata,
    departureDate: offer.departureDate,
    returnDate: offer.returnDate,
    revalidationPayload: offer.revalidationPayload
  });

  assert.ok(calls.some((call) => call.url.endsWith("/v1/shopping/flight-offers/pricing")));
  assert.equal(revalidated?.providerOfferId, "offer-priced");
  assert.equal(revalidated?.display.canAlert, true);
  assert.equal(revalidated?.display.canDisplay, true);
  assert.equal(revalidated?.display.requiresRevalidation, false);
});

test("failed revalidation prevents alert/display", async () => {
  clearAmadeusTokenCache();
  const provider = makeProvider(async (url) => {
    if (String(url).includes("/oauth2/token")) return jsonResponse(tokenBody("token"));
    if (String(url).includes("/pricing")) {
      return jsonResponse({ data: { type: "flight-offers-pricing", flightOffers: [flightOffer({ price: { currency: "USD", total: "1.00" } })] } });
    }
    return jsonResponse({ data: [flightOffer()] });
  });

  const [offer] = await provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  });
  assert.ok(offer);
  const revalidated = await provider.revalidateOffer({
    providerOfferId: offer.providerOfferId,
    originIata: offer.originIata,
    destinationIata: offer.destinationIata,
    departureDate: offer.departureDate,
    returnDate: offer.returnDate,
    revalidationPayload: offer.revalidationPayload
  });
  assert.equal(revalidated, null);
});

test("401 refreshes token once and retries request", async () => {
  clearAmadeusTokenCache();
  let tokenRequests = 0;
  let searchRequests = 0;
  const provider = makeProvider(async (url) => {
    if (String(url).includes("/oauth2/token")) {
      tokenRequests += 1;
      return jsonResponse(tokenBody(`token-${tokenRequests}`));
    }
    searchRequests += 1;
    if (searchRequests === 1) return jsonResponse({ errors: [] }, 401);
    return jsonResponse({ data: [flightOffer()] });
  });

  const offers = await provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  });
  assert.equal(offers.length, 1);
  assert.equal(tokenRequests, 2);
  assert.equal(searchRequests, 2);
});

test("429 retries with backoff and reports rate_limited when exhausted", async () => {
  clearAmadeusTokenCache();
  const slept: number[] = [];
  const provider = makeProvider(async (url) => {
    if (String(url).includes("/oauth2/token")) return jsonResponse(tokenBody("token"));
    return jsonResponse({ errors: [] }, 429, { "Retry-After": "1" });
  }, { sleep: async (ms) => { slept.push(ms); } });

  await assert.rejects(provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  }), /HTTP 429/);
  assert.deepEqual(slept, [1_000]);
  assert.equal((await provider.getProviderHealth()).status, "rate_limited");
});

test("5xx retries then marks provider degraded", async () => {
  clearAmadeusTokenCache();
  let searchRequests = 0;
  const provider = makeProvider(async (url) => {
    if (String(url).includes("/oauth2/token")) return jsonResponse(tokenBody("token"));
    searchRequests += 1;
    return jsonResponse({ errors: [] }, 503);
  });

  await assert.rejects(provider.searchRoundTripOffers({
    originIata: "KUL",
    destinationIata: "BKK",
    departureDate: "2026-10-01",
    returnDate: "2026-10-06"
  }), /HTTP 503/);
  assert.equal(searchRequests, 2);
  assert.equal((await provider.getProviderHealth()).status, "degraded");
});

test("provider registry keeps Amadeus alongside MockProvider", () => {
  clearAmadeusTokenCache();
  const providers = createProviderRegistry({
    AMADEUS_CLIENT_ID: "client-id",
    AMADEUS_CLIENT_SECRET: "client-secret"
  });
  assert.deepEqual(providers.map((provider) => provider.name), ["mock", "amadeus"]);
  assert.deepEqual(listEnabledProviders(providers).map((provider) => provider.name), ["mock", "amadeus"]);

  const disabledProviders = createProviderRegistry({});
  assert.deepEqual(disabledProviders.map((provider) => provider.name), ["mock", "amadeus"]);
  assert.deepEqual(listEnabledProviders(disabledProviders).map((provider) => provider.name), ["mock"]);
});


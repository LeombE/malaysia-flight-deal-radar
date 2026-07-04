import type { DealLabel } from "../scoring/types.ts";
import type { AirportApiRecord, DealApiRecord, ProviderLimitApiRecord } from "./api-types.ts";

export interface DashboardFilters {
  origin_iata?: string;
  destination_iata?: string;
  country_code?: string;
  region_group?: string;
  deal_label?: DealLabel;
  min_score?: number;
  departure_from?: string;
  departure_to?: string;
  stay_length_days?: number;
}

export interface DashboardModel {
  origins: AirportApiRecord[];
  destinations: AirportApiRecord[];
  deals: DealApiRecord[];
  providerLimits: ProviderLimitApiRecord[];
  filters: DashboardFilters;
  generatedAt: string;
}

const DEMO_BANNER_TEXT = "Remote demo uses controlled mock data only. Prices are not live and must be rechecked.";

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function selected(current: string | number | undefined, value: string | number): string {
  return current === value ? " selected" : "";
}

function valueAttr(value: string | number | undefined): string {
  return value === undefined ? "" : ` value="${escapeHtml(value)}"`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function formatMyrMinor(value: number | null): string {
  if (value === null) return "Unavailable";
  return `RM${(value / 100).toFixed(2)}`;
}

function formatVerified(value: string | null): string {
  if (!value) return "Not revalidated";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return `${value} UTC`;
  const date = new Date(parsed);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function freshnessFor(deal: DealApiRecord, generatedAt: string): { className: string; text: string } {
  const nowMs = Date.parse(generatedAt);
  const expiresAtMs = deal.expires_at ? Date.parse(deal.expires_at) : Number.NaN;
  if (Number.isFinite(nowMs) && Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    return { className: "expired", text: "Expired" };
  }
  if (deal.is_live) {
    return { className: "live", text: "Freshly verified" };
  }
  return { className: "stale", text: "Stale / needs revalidation" };
}

function dedupeDashboardDeals(deals: DealApiRecord[]): DealApiRecord[] {
  const seen = new Set<string>();
  const deduped: DealApiRecord[] = [];
  for (const deal of deals) {
    const key = [
      deal.provider_name,
      deal.origin,
      deal.destination,
      deal.departure_date,
      deal.return_date,
      deal.deal_label
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(deal);
  }
  return deduped;
}

function mockProviderStatus(providerLimits: ProviderLimitApiRecord[]): string {
  return providerLimits.find((provider) => provider.provider_name === "mock")?.health_status ?? "unknown";
}

function renderMetric(label: string, value: string | number): string {
  return `
    <div class="summary-card">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderSummary(deals: DealApiRecord[], providerLimits: ProviderLimitApiRecord[], generatedAt: string): string {
  const strongDeals = deals.filter((deal) => deal.deal_label === "strong_deal").length;
  const suspectedDeals = deals.filter((deal) => deal.deal_label === "suspected_deal").length;
  const staleDeals = deals.filter((deal) => freshnessFor(deal, generatedAt).className === "stale").length;
  return `
    <section class="summary-panel" aria-label="Dashboard demo summary">
      <dl class="summary-grid">
        ${renderMetric("Total demo cards", deals.length)}
        ${renderMetric("Strong deals", strongDeals)}
        ${renderMetric("Suspected deals", suspectedDeals)}
        ${renderMetric("Stale / revalidate", staleDeals)}
        ${renderMetric("Mock provider status", mockProviderStatus(providerLimits))}
      </dl>
    </section>
  `;
}

function renderDealCard(deal: DealApiRecord, generatedAt: string): string {
  const warning = deal.warning
    ? `<p class="warning">${escapeHtml(deal.warning)}</p>`
    : "";
  const freshness = freshnessFor(deal, generatedAt);
  return `
    <article class="deal-card ${freshness.className}">
      <div class="deal-card__top">
        <div>
          <h2>${escapeHtml(deal.origin)} to ${escapeHtml(deal.destination)}</h2>
          <p>${escapeHtml(deal.departure_date)} to ${escapeHtml(deal.return_date)} - ${escapeHtml(deal.stay_length_days)} nights</p>
        </div>
        <strong>${escapeHtml(deal.display_price_rm)}</strong>
      </div>
      <dl>
        <div><dt>Score</dt><dd>${escapeHtml(deal.deal_score)}</dd></div>
        <div><dt>Deal label</dt><dd>${escapeHtml(deal.deal_label)}</dd></div>
        <div><dt>Baseline median</dt><dd>${escapeHtml(formatMyrMinor(deal.baseline_median_minor_myr))}</dd></div>
        <div><dt>Historical p10</dt><dd>${escapeHtml(formatMyrMinor(deal.historical_p10_minor_myr))}</dd></div>
        <div><dt>Discount</dt><dd>${escapeHtml(deal.discount_pct)}%</dd></div>
        <div><dt>Stops</dt><dd>${escapeHtml(deal.stops)}</dd></div>
        <div><dt>Carrier</dt><dd>${escapeHtml(deal.carrier || "Unknown")}</dd></div>
        <div><dt>Provider</dt><dd>${escapeHtml(deal.provider_name)}</dd></div>
        <div><dt>Last verified</dt><dd>${escapeHtml(formatVerified(deal.last_revalidated_at))}</dd></div>
        <div><dt>Alert status</dt><dd>${escapeHtml(deal.alert_status ?? "Not sent")}</dd></div>
      </dl>
      <span class="status">${escapeHtml(freshness.text)}</span>
      ${warning}
    </article>
  `;
}

export function renderDashboardHtml(model: DashboardModel): string {
  const destinationRegions = uniqueSorted(model.destinations.map((destination) => destination.region_group));
  const destinationCountries = uniqueSorted(model.destinations.map((destination) => destination.country_code));
  const dealLabels: DealLabel[] = ["strong_deal", "suspected_deal", "watched_price", "no_deal", "urgent_revalidate", "expired"];
  const visibleDeals = dedupeDashboardDeals(model.deals);
  const dealsMarkup = visibleDeals.length > 0
    ? visibleDeals.map((deal) => renderDealCard(deal, model.generatedAt)).join("")
    : `<section class="empty">No matching deals yet.</section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Malaysia Flight Deal Radar</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #172026;
      --muted: #5d6872;
      --line: #d7dde3;
      --panel: #ffffff;
      --band: #eef4f8;
      --accent: #006b6f;
      --warn: #8a4b00;
      --warn-bg: #fff3d7;
      --stale: #6d5c7a;
      --expired: #9f2f28;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: var(--band);
    }
    header {
      padding: 22px clamp(16px, 4vw, 48px);
      background: #ffffff;
      border-bottom: 1px solid var(--line);
    }
    header h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: 0; }
    header p { margin: 0; color: var(--muted); }
    main { padding: 20px clamp(16px, 4vw, 48px) 42px; }
    .demo-banner {
      margin-bottom: 16px;
      padding: 12px 14px;
      border: 1px solid #b8d4d6;
      border-left: 5px solid var(--accent);
      border-radius: 8px;
      background: #f7fbfb;
      color: var(--ink);
      font-weight: 700;
    }
    .summary-panel { margin-bottom: 18px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
      gap: 10px;
      margin: 0;
    }
    .summary-card {
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .summary-card dt { color: var(--muted); font-size: 12px; }
    .summary-card dd { margin: 4px 0 0; font-size: 20px; font-weight: 700; overflow-wrap: anywhere; }
    form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      align-items: end;
      margin-bottom: 18px;
    }
    label { display: grid; gap: 5px; font-size: 13px; color: var(--muted); }
    select, input, button {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      background: #fff;
      color: var(--ink);
    }
    button {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
      cursor: pointer;
    }
    .deals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
    }
    .deal-card {
      position: relative;
      padding: 16px;
      border: 1px solid var(--line);
      border-left: 5px solid var(--accent);
      border-radius: 8px;
      background: var(--panel);
    }
    .deal-card.stale { border-left-color: var(--stale); }
    .deal-card.expired { border-left-color: var(--expired); }
    .deal-card__top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }
    h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: 0; }
    .deal-card p { margin: 0; color: var(--muted); }
    .deal-card strong { font-size: 22px; white-space: nowrap; }
    dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 14px;
      margin: 16px 0 0;
    }
    dt { color: var(--muted); font-size: 12px; }
    dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    .status {
      display: inline-block;
      margin-top: 14px;
      font-size: 12px;
      color: var(--accent);
    }
    .stale .status { color: var(--stale); }
    .expired .status { color: var(--expired); }
    .warning {
      margin-top: 12px;
      padding: 9px 10px;
      border-radius: 6px;
      background: var(--warn-bg);
      color: var(--warn);
    }
    .empty {
      padding: 28px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--muted);
    }
    @media (max-width: 620px) {
      .deal-card__top { display: block; }
      .deal-card strong { display: block; margin-top: 8px; }
      dl { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Malaysia Flight Deal Radar</h1>
    <p>Generated ${escapeHtml(formatVerified(model.generatedAt))}. Stale offers are flagged for revalidation.</p>
  </header>
  <main>
    <section class="demo-banner">${escapeHtml(DEMO_BANNER_TEXT)}</section>
    ${renderSummary(visibleDeals, model.providerLimits, model.generatedAt)}
    <form method="get" action="/dashboard">
      <label>Origin
        <select name="origin_iata">
          <option value="">All origins</option>
          ${model.origins.map((origin) => `<option value="${escapeHtml(origin.iata_code)}"${selected(model.filters.origin_iata, origin.iata_code)}>${escapeHtml(origin.iata_code)}</option>`).join("")}
        </select>
      </label>
      <label>Region
        <select name="region_group">
          <option value="">All regions</option>
          ${destinationRegions.map((region) => `<option value="${escapeHtml(region)}"${selected(model.filters.region_group, region)}>${escapeHtml(region)}</option>`).join("")}
        </select>
      </label>
      <label>Country
        <select name="country_code">
          <option value="">All countries</option>
          ${destinationCountries.map((country) => `<option value="${escapeHtml(country)}"${selected(model.filters.country_code, country)}>${escapeHtml(country)}</option>`).join("")}
        </select>
      </label>
      <label>Destination
        <select name="destination_iata">
          <option value="">All destinations</option>
          ${model.destinations.map((destination) => `<option value="${escapeHtml(destination.iata_code)}"${selected(model.filters.destination_iata, destination.iata_code)}>${escapeHtml(destination.iata_code)} - ${escapeHtml(destination.city)}</option>`).join("")}
        </select>
      </label>
      <label>Deal label
        <select name="deal_label">
          <option value="">All labels</option>
          ${dealLabels.map((label) => `<option value="${escapeHtml(label)}"${selected(model.filters.deal_label, label)}>${escapeHtml(label)}</option>`).join("")}
        </select>
      </label>
      <label>Min score
        <input type="number" min="0" max="100" name="min_score"${valueAttr(model.filters.min_score)}>
      </label>
      <label>Depart from
        <input type="date" name="departure_from"${valueAttr(model.filters.departure_from)}>
      </label>
      <label>Depart to
        <input type="date" name="departure_to"${valueAttr(model.filters.departure_to)}>
      </label>
      <label>Stay length
        <input type="number" min="1" max="45" name="stay_length_days"${valueAttr(model.filters.stay_length_days)}>
      </label>
      <button type="submit">Apply</button>
    </form>
    <section class="deals">
      ${dealsMarkup}
    </section>
  </main>
</body>
</html>`;
}
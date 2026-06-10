import type { AirportApiRecord, DealApiRecord } from "./api-types.ts";

export interface DashboardFilters {
  origin_iata?: string;
  destination_iata?: string;
  country_code?: string;
  region_group?: string;
  departure_from?: string;
  departure_to?: string;
  stay_length_days?: number;
}

export interface DashboardModel {
  origins: AirportApiRecord[];
  destinations: AirportApiRecord[];
  deals: DealApiRecord[];
  filters: DashboardFilters;
  generatedAt: string;
}

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

function formatBaseline(deal: DealApiRecord): string {
  if (deal.baseline_median_minor_myr === null) return "Baseline unavailable";
  return `Baseline RM${(deal.baseline_median_minor_myr / 100).toFixed(2)}`;
}

function formatVerified(value: string | null): string {
  if (!value) return "Not revalidated";
  return value.replace("T", " ").replace(".000Z", " UTC");
}

function renderDealCard(deal: DealApiRecord): string {
  const warning = deal.warning
    ? `<p class="warning">${escapeHtml(deal.warning)}</p>`
    : "";
  const liveClass = deal.is_live ? "live" : "stale";
  const liveText = deal.is_live ? "Freshly verified" : "Needs revalidation";
  return `
    <article class="deal-card ${liveClass}">
      <div class="deal-card__top">
        <div>
          <h2>${escapeHtml(deal.origin)} to ${escapeHtml(deal.destination)}</h2>
          <p>${escapeHtml(deal.departure_date)} to ${escapeHtml(deal.return_date)} · ${escapeHtml(deal.stay_length_days)} nights</p>
        </div>
        <strong>${escapeHtml(deal.display_price_rm)}</strong>
      </div>
      <dl>
        <div><dt>Score</dt><dd>${escapeHtml(deal.deal_score)} · ${escapeHtml(deal.deal_label)}</dd></div>
        <div><dt>Baseline</dt><dd>${escapeHtml(formatBaseline(deal))}</dd></div>
        <div><dt>Discount</dt><dd>${escapeHtml(deal.discount_pct)}%</dd></div>
        <div><dt>Stops</dt><dd>${escapeHtml(deal.stops)}</dd></div>
        <div><dt>Carrier</dt><dd>${escapeHtml(deal.carrier || "Unknown")}</dd></div>
        <div><dt>Provider</dt><dd>${escapeHtml(deal.provider_name)}</dd></div>
        <div><dt>Verified</dt><dd>${escapeHtml(formatVerified(deal.last_revalidated_at))}</dd></div>
      </dl>
      <span class="status">${escapeHtml(liveText)}</span>
      ${warning}
    </article>
  `;
}

export function renderDashboardHtml(model: DashboardModel): string {
  const destinationRegions = uniqueSorted(model.destinations.map((destination) => destination.region_group));
  const destinationCountries = uniqueSorted(model.destinations.map((destination) => destination.country_code));
  const dealsMarkup = model.deals.length > 0
    ? model.deals.map(renderDealCard).join("")
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
    <p>Generated ${escapeHtml(model.generatedAt)}. Stale offers are flagged for revalidation.</p>
  </header>
  <main>
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
          ${model.destinations.map((destination) => `<option value="${escapeHtml(destination.iata_code)}"${selected(model.filters.destination_iata, destination.iata_code)}>${escapeHtml(destination.iata_code)} · ${escapeHtml(destination.city)}</option>`).join("")}
        </select>
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

import type {
  AirportApiRecord,
  PriceCalendarApiRecord,
  PriceCalendarFilters,
  PriceCalendarFreshnessLabel,
  PriceCalendarSortBy
} from "./api-types.ts";

export interface CalendarModel {
  origins: AirportApiRecord[];
  destinations: AirportApiRecord[];
  rows: PriceCalendarApiRecord[];
  filters: PriceCalendarFilters;
  generatedAt: string;
}

interface CalendarBadges {
  cheapestKeys: Set<string>;
  bestScoreKeys: Set<string>;
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

function formatUtc(value: string | null): string {
  if (!value) return "None";
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

function regionLabel(value: string): string {
  if (value === "SOUTHEAST_ASIA") return "Southeast Asia";
  if (value === "MAINLAND_CHINA") return "China";
  if (value === "TAIWAN") return "Taiwan";
  if (value === "JAPAN") return "Japan";
  return value.replaceAll("_", " ");
}

function freshnessClass(value: PriceCalendarFreshnessLabel): string {
  if (value === "expired") return "expired";
  if (value === "cached") return "cached";
  if (value === "recent") return "recent";
  return "fresh";
}

function providerDisplay(providerName: string): { label: string; badge: string; badgeClass: string; explanation: string } {
  if (providerName === "travelpayouts") {
    return {
      label: "Travelpayouts cached",
      badge: "Cached import row",
      badgeClass: "imported",
      explanation: "local cached import row; not live or bookable inventory"
    };
  }
  if (providerName === "travelpayouts_demo") {
    return {
      label: "Demo data",
      badge: "Demo seed data",
      badgeClass: "demo",
      explanation: "controlled demo seed; not live or bookable inventory"
    };
  }
  return {
    label: providerName,
    badge: "Cached data",
    badgeClass: "cached-source",
    explanation: "cached discovery row; recheck before use"
  };
}

function rowKey(row: PriceCalendarApiRecord): string {
  return [
    row.provider_name,
    row.origin_iata,
    row.destination_iata,
    row.departure_date,
    row.return_date,
    row.display_price_rm,
    row.flight_number ?? ""
  ].join("|");
}

function calendarBadges(rows: PriceCalendarApiRecord[]): CalendarBadges {
  const pricedRows = rows.filter((row) => row.amount_minor_myr !== null);
  const cheapest = pricedRows.reduce<number | null>((current, row) => {
    if (row.amount_minor_myr === null) return current;
    return current === null ? row.amount_minor_myr : Math.min(current, row.amount_minor_myr);
  }, null);
  const bestScore = rows.reduce<number | null>((current, row) => {
    if (row.deal_score === null) return current;
    return current === null ? row.deal_score : Math.max(current, row.deal_score);
  }, null);
  return {
    cheapestKeys: new Set(rows.filter((row) => row.amount_minor_myr !== null && row.amount_minor_myr === cheapest).map(rowKey)),
    bestScoreKeys: new Set(rows.filter((row) => row.deal_score !== null && row.deal_score === bestScore).map(rowKey))
  };
}

function renderSearchLink(row: PriceCalendarApiRecord): string {
  if (!row.search_link) return "No link";
  return `<a href="${escapeHtml(row.search_link)}" rel="nofollow noopener noreferrer">Search/recheck</a>`;
}

function renderRowBadges(row: PriceCalendarApiRecord, badges: CalendarBadges): string {
  const rowKeyValue = rowKey(row);
  const parts: string[] = [];
  if (badges.cheapestKeys.has(rowKeyValue)) {
    parts.push(`<span class="row-badge cheapest">Cheapest in current table</span>`);
  }
  if (row.deal_label) {
    parts.push(`<span class="row-badge deal">${escapeHtml(row.deal_label)}</span>`);
  }
  if (badges.bestScoreKeys.has(rowKeyValue) && row.deal_score !== null) {
    parts.push(`<span class="row-badge score">Best score ${escapeHtml(row.deal_score)}</span>`);
  } else if (row.deal_score !== null) {
    parts.push(`<span class="row-badge score">Score ${escapeHtml(row.deal_score)}</span>`);
  }
  return parts.join("");
}

function renderRow(row: PriceCalendarApiRecord, badges: CalendarBadges): string {
  const provider = providerDisplay(row.provider_name);
  return `
    <tr class="${freshnessClass(row.freshness_label)}">
      <td><strong>${escapeHtml(row.origin_iata)} -> ${escapeHtml(row.destination_iata)}</strong><span>${escapeHtml(regionLabel(row.destination_region))}</span>${renderRowBadges(row, badges)}</td>
      <td>${escapeHtml(row.departure_date)}</td>
      <td>${escapeHtml(row.return_date)}</td>
      <td>${escapeHtml(row.stay_length_days)}</td>
      <td><strong>${escapeHtml(row.display_price_rm)}</strong><span>${escapeHtml(row.original_amount)} ${escapeHtml(row.original_currency)}</span></td>
      <td>${escapeHtml(row.airline_iata ?? "Unknown")}<span>${escapeHtml(row.flight_number ?? "")}</span></td>
      <td>${escapeHtml(row.stops ?? "Unknown")}</td>
      <td><strong>${escapeHtml(provider.label)}</strong><span class="source-badge ${escapeHtml(provider.badgeClass)}">${escapeHtml(provider.badge)}</span><span>${escapeHtml(provider.explanation)}</span><span>provider_name=${escapeHtml(row.provider_name)}</span><span>${escapeHtml(row.source_endpoint)}</span><span class="source-flags">is_live=false; is_bookable_claim=false</span></td>
      <td>${escapeHtml(formatUtc(row.retrieved_at))}</td>
      <td>${escapeHtml(formatUtc(row.expires_at))}</td>
      <td><span class="pill ${freshnessClass(row.freshness_label)}">${escapeHtml(row.freshness_label)}</span><span>Cached/demo freshness label, not a live guarantee.</span></td>
      <td>${escapeHtml(row.warning)}</td>
      <td>${renderSearchLink(row)}<span>Generic search/recheck links may not preserve this fare; verify price, dates, airline, baggage, and availability.</span></td>
    </tr>
  `;
}

function renderLegends(): string {
  return `
    <section class="legend-grid" aria-label="Calendar legends">
      <div class="legend-panel">
        <h2>Freshness legend</h2>
        <p><strong>fresh</strong> means the cached/demo row was found recently in its source context; <strong>recent</strong> and <strong>cached</strong> are older discovery labels; <strong>expired</strong> is hidden unless requested. These labels are not a live guarantee.</p>
      </div>
      <div class="legend-panel">
        <h2>Provider legend</h2>
        <p><strong>travelpayouts_demo</strong> is controlled demo seed data. <strong>travelpayouts</strong> is a local cached import row when present. Both are discovery records, not live or bookable inventory.</p>
      </div>
    </section>
  `;
}

export function renderCalendarHtml(model: CalendarModel): string {
  const destinationRegions = uniqueSorted(model.destinations.map((destination) => destination.region_group));
  const destinationCountries = uniqueSorted(model.destinations.map((destination) => destination.country_code));
  const freshnessLabels: PriceCalendarFreshnessLabel[] = ["fresh", "recent", "cached", "expired"];
  const sortOptions: PriceCalendarSortBy[] = ["price", "departure_date", "duration", "stops"];
  const providerOptions = [
    { value: "travelpayouts", label: "Travelpayouts cached" },
    { value: "travelpayouts_demo", label: "Demo data" }
  ];
  const badges = calendarBadges(model.rows);
  const rowsMarkup = model.rows.length > 0
    ? model.rows.map((row) => renderRow(row, badges)).join("")
    : `<tr><td colspan="13" class="empty">No matching calendar fares yet.</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KUL Asia Price Calendar</title>
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
      --warn-bg: #fff4dc;
      --expired: #9f2f28;
      --cached: #6d5c7a;
      --recent: #4f6f1f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: var(--band);
    }
    header, main { padding: 20px clamp(16px, 4vw, 48px); }
    header {
      background: #fff;
      border-bottom: 1px solid var(--line);
    }
    h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 6px; font-size: 16px; letter-spacing: 0; }
    header p { margin: 0; color: var(--muted); }
    .banner {
      margin: 14px 0 0;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-left: 5px solid var(--warn);
      border-radius: 6px;
      background: var(--warn-bg);
      color: var(--warn);
    }
    .legend-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .legend-panel {
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .legend-panel p { margin: 0; color: var(--muted); }
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
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    table {
      width: 100%;
      min-width: 1220px;
      border-collapse: collapse;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
      font-size: 14px;
    }
    th { background: #f7fafb; color: var(--muted); font-size: 12px; }
    td span { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; }
    .pill, .row-badge {
      display: inline-block;
      width: fit-content;
      margin: 0;
      padding: 3px 7px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--accent);
      background: #fff;
      font-size: 12px;
    }
    .pill.recent { color: var(--recent); }
    .pill.cached { color: var(--cached); }
    .pill.expired { color: var(--expired); }
    .row-badge { display: block; margin-top: 5px; }
    .row-badge.cheapest { color: var(--accent); border-color: var(--accent); background: #ecf8f8; }
    .row-badge.deal { color: var(--warn); border-color: var(--warn); background: var(--warn-bg); }
    .row-badge.score { color: var(--cached); border-color: var(--cached); background: #f5f1f7; }
    .source-badge {
      display: inline-block;
      width: fit-content;
      margin-top: 5px;
      padding: 3px 7px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: #f7fafb;
      font-size: 12px;
    }
    .source-badge.imported { color: var(--accent); border-color: var(--accent); background: #ecf8f8; }
    .source-badge.demo { color: var(--cached); border-color: var(--cached); background: #f5f1f7; }
    .source-flags { color: var(--warn); }
    tr.expired { opacity: 0.7; }
    a { color: var(--accent); }
    .empty { color: var(--muted); text-align: center; padding: 28px; }
  </style>
</head>
<body>
  <header>
    <h1>KUL Asia Price Calendar</h1>
    <p>Generated ${escapeHtml(formatUtc(model.generatedAt))}. Rows are cached or recently found demo fares, sorted by low RM price.</p>
    <div class="banner">Cached fare data only. Not live. Recheck before purchase. Prices may have changed. Demo travel dates come from a fixed mock snapshot.</div>
  </header>
  <main>
    ${renderLegends()}
    <form method="get" action="/calendar">
      <label>Origin
        <select name="origin_iata">
          ${model.origins.map((origin) => `<option value="${escapeHtml(origin.iata_code)}"${selected(model.filters.origin_iata, origin.iata_code)}>${escapeHtml(origin.iata_code)}</option>`).join("")}
        </select>
      </label>
      <label>Region
        <select name="destination_region">
          <option value="">All regions</option>
          ${destinationRegions.map((region) => `<option value="${escapeHtml(region)}"${selected(model.filters.destination_region, region)}>${escapeHtml(regionLabel(region))}</option>`).join("")}
        </select>
      </label>
      <label>Country
        <select name="destination_country">
          <option value="">All countries</option>
          ${destinationCountries.map((country) => `<option value="${escapeHtml(country)}"${selected(model.filters.destination_country, country)}>${escapeHtml(country)}</option>`).join("")}
        </select>
      </label>
      <label>Destination
        <select name="destination_iata">
          <option value="">All destinations</option>
          ${model.destinations.map((destination) => `<option value="${escapeHtml(destination.iata_code)}"${selected(model.filters.destination_iata, destination.iata_code)}>${escapeHtml(destination.iata_code)} - ${escapeHtml(destination.city)}</option>`).join("")}
        </select>
      </label>
      <label>Provider
        <select name="provider_name">
          <option value=""${model.filters.provider_name ? "" : " selected"}>All providers</option>
          ${providerOptions.map((provider) => `<option value="${escapeHtml(provider.value)}"${selected(model.filters.provider_name, provider.value)}>${escapeHtml(provider.label)}</option>`).join("")}
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
      <label>Max stops
        <input type="number" min="0" max="3" name="max_stops"${valueAttr(model.filters.max_stops)}>
      </label>
      <label>Freshness
        <select name="freshness">
          <option value="">All non-expired</option>
          ${freshnessLabels.map((label) => `<option value="${escapeHtml(label)}"${selected(model.filters.freshness, label)}>${escapeHtml(label)}</option>`).join("")}
        </select>
      </label>
      <label>Sort
        <select name="sort_by">
          ${sortOptions.map((option) => `<option value="${escapeHtml(option)}"${selected(model.filters.sort_by, option)}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Departure</th>
            <th>Return</th>
            <th>Stay</th>
            <th>Price</th>
            <th>Airline</th>
            <th>Stops</th>
            <th>Provider</th>
            <th>Last found</th>
            <th>Expires</th>
            <th>Freshness</th>
            <th>Warning</th>
            <th>Recheck</th>
          </tr>
        </thead>
        <tbody>${rowsMarkup}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const portfolioDocs = [
  "README.md",
  "docs/architecture.md",
  "docs/screenshots.md",
  "docs/resume_project_summary.md",
  "docs/roadmap.md",
  "docs/portfolio_evidence.md",
  "reports/deployment-health-snapshot.example.md"
];

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

test("README includes required portfolio sections and verified deployment evidence", () => {
  const readme = readText("README.md");

  for (const required of [
    "# Malaysia Flight Deal Radar",
    "Project Summary",
    "Problem Statement",
    "Target Users And Stakeholders",
    "Verified Deployment Evidence",
    "Key Features",
    "Architecture Overview",
    "Tech Stack",
    "Data Flow",
    "Deal Scoring Methodology",
    "Safety Design",
    "Provider Readiness Design",
    "Cloudflare Deployment Notes",
    "Current Demo Status",
    "Limitations",
    "Future Roadmap",
    "Run Locally",
    "Run Tests",
    "Deploy Safely",
    "Keep Real Providers Disabled"
  ]) {
    assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(readme, /https:\/\/malaysia-flight-deal-radar-demo\.spaceleoch-flight-radar\.workers\.dev\/dashboard/);
  assert.match(readme, /`strong_deal` count = 2/);
  assert.match(readme, /`suspected_deal` count = 2/);
  assert.match(readme, /`no_deal` count = 5/);
  assert.match(readme, /mock provider is healthy/);
  assert.match(readme, /real providers are disabled/);
});

test("portfolio docs honestly describe mock demo status and avoid live coverage claims", () => {
  const combined = portfolioDocs.map(readText).join("\n");

  assert.match(combined, /controlled mock fare data/i);
  assert.match(combined, /cached price-calendar demo/i);
  assert.match(combined, /real providers (?:remain|are) disabled/i);
  assert.match(combined, /Duffel sandbox adapter is tested/i);
  assert.match(combined, /Do not claim live commercial flight coverage/i);
  assert.equal(/live commercial flight coverage is enabled/i.test(combined), false);
  assert.equal(/uses live commercial flight provider data/i.test(combined), false);
  assert.equal(/books flights|creates bookings|creates orders|processes payments|issues tickets/i.test(combined), false);
});

test("portfolio docs do not include secret markers or token-shaped values", () => {
  const combined = portfolioDocs.map(readText).join("\n");

  for (const forbidden of [
    "ADMIN_TOKEN",
    "DUFFEL_ACCESS_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "AMADEUS_CLIENT_ID",
    "AMADEUS_CLIENT_SECRET",
    "SKYSCANNER_API_KEY"
  ]) {
    assert.equal(combined.includes(forbidden), false, `${forbidden} must not appear in portfolio docs`);
  }

  assert.equal(/duffel_(?:test|live)_[A-Za-z0-9_-]+/i.test(combined), false);
  assert.equal(/\bBearer\s+[A-Za-z0-9._-]+/i.test(combined), false);
  assert.equal(/\b[0-9]{6,}:[A-Za-z0-9_-]{20,}\b/.test(combined), false);
});

test("roadmap includes required future phases without enabling real providers now", () => {
  const roadmap = readText("docs/roadmap.md");

  for (const required of [
    "Phase 8B: Travelpayouts Cached Fare Calendar",
    "Phase 8C: Safe Local Travelpayouts Smoke Tooling",
    "Phase 8D: Local Travelpayouts Import Into Local D1",
    "Phase 8E: Real Cached Data vs Demo Data Separation",
    "Phase 8F: Skyscanner Access Preparation",
    "Phase 8G: Real Provider Activation Checklist",
    "Phase 9: Limited Live Provider Dry Run",
    "Phase 10: Production Monitoring",
    "Phase 11: GitHub Actions / Scheduled Report"
  ]) {
    assert.match(roadmap, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(roadmap, /current online demo uses controlled mock fare data/i);
});

test("repository hygiene keeps private local artifacts out of git", () => {
  const gitignore = readText(".gitignore");

  for (const required of [
    ".dev.vars",
    ".env",
    "wrangler.toml",
    "logs/",
    "demo-data/",
    "smoke-output/",
    "reports/deployment-health-snapshot.md",
    "reports/deployment-health-snapshot-*.md"
  ]) {
    assert.match(gitignore, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("portfolio evidence uses cf dev for imported local D1 rows", () => {
  const evidence = readText("docs/portfolio_evidence.md");

  assert.match(evidence, /npm run cf:dev/);
  assert.match(evidence, /127\.0\.0\.1:8787\/calendar\?provider_name=travelpayouts&destination_iata=BKK/);
  assert.match(evidence, /provider_name=travelpayouts_demo/);
  assert.match(evidence, /not evidence that imported rows are being read from Wrangler local D1/i);
  assert.equal(/live availability is enabled/i.test(evidence), false);
  assert.equal(/bookable inventory (?:is|are) (?:enabled|available)/i.test(evidence), false);
});

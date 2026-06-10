# Malaysia Flight Deal Radar

Real-time-ish flight deal radar for Malaysia-based travelers. The system scans round-trip economy fares from Malaysian origins to selected Asia destinations, detects unusually cheap MYR fares, and can alert users after provider revalidation.

This repository currently contains the provider scaffold and an optional Amadeus fallback adapter. It is not a booking engine and does not store passenger identity, passport data, payment data, or ticketing state.

## Phase 2 Modules

- D1 migrations live in `migrations/`.
- Airport seed data lives in `src/seeds/airports.ts` and `migrations/0002_seed_airports.sql`.
- Deal scoring lives in `src/scoring/`.
- Duplicate alert prevention lives in `src/alerts/duplicate-alerts.ts`.

All persisted MYR prices use integer minor units:

- `amount_minor_myr`
- `baseline_median_minor_myr`
- `historical_p10_minor_myr`

The scoring engine uses median and p10 baselines instead of average prices because flight fares often contain outliers. A stale provider fare is never treated as a live fare; it must be revalidated before alerting or display. A suspected deal is also not a confirmed airline promotion unless a provider explicitly returns promotion or campaign metadata.

## Local Runtime

This workspace may not have global `node` or `npm` on PATH. In the Codex desktop environment, Node is available at:

```powershell
C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
```

Run tests directly with:

```powershell
& 'C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.ts
```

Run the lightweight import/type-strip check with:

```powershell
& 'C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/typecheck.mjs
```

When npm is available, the same commands are exposed as:

```powershell
npm run typecheck
npm test
```

Apply the D1 schema and seeds in order:

```powershell
wrangler d1 migrations apply <database-name>
```

## Environment

Copy `.dev.vars.example` to `.dev.vars` for local development. Never commit real secrets.

Amadeus is optional and disabled unless both `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` are present.

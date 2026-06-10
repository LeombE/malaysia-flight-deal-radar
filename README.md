# Malaysia Flight Deal Radar

Real-time-ish flight deal radar for Malaysia-based travelers. The system scans round-trip economy fares from Malaysian origins to selected Asia destinations, detects unusually cheap MYR fares, and can alert users after provider revalidation.

This repository currently contains the provider scaffold and an optional Amadeus fallback adapter. It is not a booking engine and does not store passenger identity, passport data, payment data, or ticketing state.

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

## Environment

Copy `.dev.vars.example` to `.dev.vars` for local development. Never commit real secrets.

Amadeus is optional and disabled unless both `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` are present.


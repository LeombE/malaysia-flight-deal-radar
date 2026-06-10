# Local Demo

Phase 5.5 adds a deterministic local demo path. It lets you verify the dashboard and JSON API before integrating any real flight provider.

The demo uses:

- committed airport seeds
- five demo route candidates
- seeded historical fare snapshots
- deterministic `MockProvider` offers
- an in-memory repository persisted to `demo-data/demo-state.json`

`demo-data/` is ignored by Git and can be recreated at any time.

## PowerShell Quick Start

```powershell
cd "C:\Users\Admin\OneDrive\Documents\flight API real time"
npm install
npm run typecheck --if-present
npm test --if-present
npm run seed
npm run demo:scan
npm run dev
```

Open:

```powershell
Start-Process "http://localhost:8787/dashboard"
```

Check APIs:

```powershell
Invoke-RestMethod "http://localhost:8787/health"
Invoke-RestMethod "http://localhost:8787/api/deals"
Invoke-RestMethod "http://localhost:8787/api/provider-health"
```

## Demo Data

`npm run seed` creates:

- `JHB`, `KUL`, `SZB` origins
- destination airport records from the project seed list
- route candidates for `KUL-BKK`, `KUL-TPE`, `KUL-SIN`, `JHB-BKK`, and `SZB-NRT`
- 100 historical fare snapshots

`npm run demo:scan` runs one deterministic MockProvider scan. It should produce:

- at least one `no_deal`
- at least one `suspected_deal`
- at least one `strong_deal`

This makes `/api/deals` and `/dashboard` useful immediately.

## Admin Scan

Without `ADMIN_TOKEN`, the admin scan endpoint is disabled:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8787/api/admin/scan"
```

To enable it locally:

```powershell
Copy-Item ".dev.vars.example" ".dev.vars"
(Get-Content ".dev.vars") -replace '^ADMIN_TOKEN=.*', 'ADMIN_TOKEN=local-demo-token' | Set-Content ".dev.vars"
npm run dev
```

Then in another PowerShell window:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8787/api/admin/scan" -Headers @{ Authorization = "Bearer local-demo-token" }
```

The token above is a local placeholder only. Do not commit `.dev.vars`.

## What Is Still Mock

The local demo does not call Amadeus, Skyscanner, Duffel, Telegram, airlines, OTAs, or any external network service. Amadeus remains an optional fallback scaffold and appears as disabled when credentials are absent.

Phase 6 can add a real provider only after partner access, retention rules, rate limits, and display/revalidation requirements are verified.

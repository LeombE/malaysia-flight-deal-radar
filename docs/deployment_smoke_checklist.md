# Deployment Smoke Checklist

Use this checklist after `npm run cf:deploy` for the mock/demo Cloudflare deployment.

Set the deployed Worker URL:

```powershell
$base = "https://<your-worker>.<your-subdomain>.workers.dev"
```

## Health

```powershell
Invoke-RestMethod "$base/health"
```

Expected:

- `ok` is `true`
- `status` is `ok`
- response includes provider status summaries
- no token, secret, or raw provider payload appears

## Dashboard

```powershell
Start-Process "$base/dashboard"
```

Expected:

- page renders HTML
- origin filter includes `JHB`, `KUL`, and `SZB`
- deal cards render if D1 has scanned/demo data
- stale or expired offers are labelled as stale or expired
- stale cached fares are not shown as live fares

## Provider Health

```powershell
Invoke-RestMethod "$base/api/provider-health"
```

Expected:

- `mock` is enabled and healthy/available for demo use
- `amadeus` is disabled unless credentials are intentionally configured
- `duffel` is disabled in the first mock/demo deployment
- readiness reasons include safe blockers such as `real_providers_disabled`, `dry_run_enabled`, or `credentials_missing`
- no `ADMIN_TOKEN`, Telegram token, Duffel token, Amadeus secret, or future Skyscanner key appears

## Deals API

```powershell
Invoke-RestMethod "$base/api/deals"
```

Expected:

- response is JSON
- prices are represented in integer MYR minor units and display RM strings
- response contains normalized deal records only
- no raw provider payload, authorization header, token, revalidation payload, passport data, passenger identity, order, payment, or ticketing field appears

If the remote D1 database has just been migrated and scanned once, it can initially show only `no_deal`. That means there are not enough historical baseline samples yet. Run the remote demo baseline seed, then trigger admin scan again:

```powershell
npm run cf:demo:seed:remote
npm run cf:demo:verify:remote
$adminToken = Read-Host "ADMIN_TOKEN"
Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer $adminToken" }
Invoke-RestMethod "$base/api/deals"
```

Expected after the seeded mock scan:

- `SZB-NRT` and `KUL-BKK` show `strong_deal`
- `KUL-TPE` and `JHB-BKK` show `suspected_deal`
- `KUL-SIN` can remain `no_deal`
- dashboard cards show baseline median and historical p10

## Admin Scan Disabled

With no `ADMIN_TOKEN` secret:

```powershell
Invoke-RestMethod -Method Post "$base/api/admin/scan"
```

Expected:

- request is rejected
- response indicates the admin endpoint is disabled
- no scan runs from an unauthenticated request

## Admin Scan Protected

If `ADMIN_TOKEN` is intentionally configured, a wrong token must fail:

```powershell
Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer wrong-token" }
```

Expected:

- response is unauthorized
- no token value is echoed

Use the real token only from your shell:

```powershell
$adminToken = Read-Host "ADMIN_TOKEN"
Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer $adminToken" }
```

## Real Provider Safety

Before considering this smoke complete, verify:

- `ENABLE_REAL_PROVIDERS=false`
- `REAL_PROVIDER_DRY_RUN=true`
- `DEFAULT_REAL_PROVIDER=""`
- `MAX_REAL_PROVIDER_SEARCHES_PER_RUN=1`
- `MAX_REAL_PROVIDER_DAILY_BUDGET=1`
- `TELEGRAM_DRY_RUN=true`
- no `DUFFEL_ACCESS_TOKEN` is set in Cloudflare for the first mock/demo deployment
- Skyscanner has not been added

## Rollback Switches

If anything looks wrong:

1. Set `ENABLE_REAL_PROVIDERS=false`.
2. Set `REAL_PROVIDER_DRY_RUN=true`.
3. Clear `DEFAULT_REAL_PROVIDER`.
4. Set `TELEGRAM_DRY_RUN=true`.
5. Deploy again.
6. To pause cron scans, deploy with `crons = []`.

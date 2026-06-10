# Deployment Readiness

Phase 5.5 prepares the repository for local verification and Cloudflare Worker deployment setup. It is not a real-provider launch phase.

## Current Runtime Surfaces

- Worker entrypoint: `src/index.ts`
- Local demo server: `npm run dev`
- Deterministic seed: `npm run seed`
- Deterministic MockProvider scan: `npm run demo:scan`
- Verification bundle: `npm run check`

## Wrangler Setup

Copy the example config:

```powershell
Copy-Item "wrangler.toml.example" "wrangler.toml"
```

Create and bind D1:

```powershell
npx wrangler d1 create malaysia-flight-deal-radar-local
```

Paste the returned IDs into `wrangler.toml`, then apply migrations locally:

```powershell
npx wrangler d1 migrations apply malaysia-flight-deal-radar-local --local
```

Run the Worker with Wrangler:

```powershell
npx wrangler dev
```

The repository does not require real provider credentials for local verification. If Amadeus credentials are missing, Amadeus remains disabled.

## Secrets

Keep these values server-side only:

- `ADMIN_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`
- future provider credentials

Use `.dev.vars` locally and Cloudflare secrets for deployed environments. Do not commit `.dev.vars`, real tokens, or provider credentials.

## Smoke Checks

After local startup:

```powershell
Invoke-RestMethod "http://localhost:8787/health"
Invoke-RestMethod "http://localhost:8787/api/deals"
Start-Process "http://localhost:8787/dashboard"
```

Admin scan should be disabled when `ADMIN_TOKEN` is blank and should reject a wrong bearer token when configured.

## Phase 6 Readiness

Before adding a real provider in Phase 6, confirm:

- partner API access is approved
- allowed fare display and retention terms are known
- raw payload storage remains disabled unless explicitly allowed
- revalidation is available before alert or deep-link display
- rate limits and daily budgets are configured
- tests use mocked HTTP only

Do not make Amadeus the only provider, and do not add Skyscanner or Duffel until their access and compliance constraints are explicitly approved.

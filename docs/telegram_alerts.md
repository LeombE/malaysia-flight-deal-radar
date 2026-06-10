# Telegram Alerts

Phase 4 adds Telegram alert evaluation and delivery for high-confidence flight deals.

## Setup

1. Open Telegram and talk to `@BotFather`.
2. Create a bot with `/newbot`.
3. Copy the bot token into `TELEGRAM_BOT_TOKEN` in `.dev.vars`.
4. Send a message to the bot from the target chat.
5. Get the chat ID by calling Telegram's `getUpdates` endpoint locally, or by using a trusted chat ID helper bot.
6. Copy the chat ID into `TELEGRAM_CHAT_ID`.

Keep `.dev.vars` local. Do not commit real bot tokens or chat IDs.

## Local Configuration

`.dev.vars.example` includes placeholders:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_DRY_RUN`
- `TELEGRAM_TIMEOUT_MS`
- `TELEGRAM_MAX_RETRY_ATTEMPTS`
- `TELEGRAM_RETRY_BASE_DELAY_MS`
- `ALERT_COOLDOWN_HOURS`

If token or chat ID is missing, Telegram sending is disabled safely. Tests use mocked HTTP only and never send real Telegram messages.

## Alert Rules

The system sends alerts only when all of these are true:

- score is at least 70
- deal label is `suspected_deal` or `strong_deal`
- fare was recently revalidated
- offer is not expired
- provider display/retention rules allow normalized alert content
- no duplicate alert was sent within the cooldown window
- route, dates, price, carrier, and duration are present
- price is normalized to MYR minor units

Stale prices are not sent because flight fares can change quickly. A cached historical fare is useful for baselines, but it is not a live offer.

## Delivery Behavior

Telegram delivery is best-effort. If Telegram is disabled or temporarily fails, the scan still succeeds and the alert outcome is recorded. This keeps fare collection separate from notification reliability.

The app does not buy tickets automatically. Alerts are informational only; users manually verify and purchase through provider or airline/OTA links when allowed by provider rules.

Dashboard and API display follow the same freshness rule. Stale cached fares can be shown only with warning state and must not be presented as live fares or purchase-ready deep links.

## Provider Scope

No additional real provider is added in this phase. Amadeus remains optional/fallback only, and `MockProvider` remains the default provider for tests and local scan simulation.

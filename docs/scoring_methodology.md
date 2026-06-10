# Scoring Methodology

## Money

All persisted MYR prices use integer minor units. For example, RM499.90 is stored as `49990`. This avoids rounding drift in baselines, comparisons, and alert decisions.

## Baseline

The scoring engine uses historical median and p10 instead of a simple average.

Flight prices are spiky: one holiday fare, bad connection, or temporary provider anomaly can pull an average upward and make an ordinary fare look like a deal. Median is more robust because it represents the middle observed fare after sorting samples. The p10 value is also useful because it captures the lower tail of normal historical prices for a route/date/stay pattern.

## Deal Labels

- `no_deal`: not enough evidence or below threshold.
- `watched_price`: watchlist route with insufficient history.
- `suspected_deal`: at least 20% below historical median with at least 20 samples.
- `strong_deal`: at least 30% below median or at/below historical p10.
- `urgent_revalidate`: the fare may be interesting but is stale or requires provider revalidation.
- `expired`: provider offer expiry is in the past.

`suspected_deal` and `suspected_promotion` are not the same as confirmed airline promotions. The app must not call something a confirmed promotion unless a provider explicitly returns campaign or promotion data.

## Freshness

Stale fares cannot be shown as live fares. Flight prices can change quickly, and provider search responses may be short-lived or subject to strict retention/display rules. A stale fare can be used as historical context only; alerting and live display require recent revalidation.

## Quality Penalties

The score is reduced for itineraries that are less useful to travelers:

- too many stops
- very long total duration
- self-transfer
- stale verification
- missing carrier data

Alerts require score `>= 70`, a non-expired offer, and recent revalidation.

The scheduler always attempts revalidation before storing an offer as alert/display eligible. Telegram alerts can only be triggered for fresh `suspected_deal` or `strong_deal` scores at or above 70.

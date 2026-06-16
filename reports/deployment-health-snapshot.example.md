# Deployment Health Snapshot

Generated: 2026-06-16T00:00:00.000Z
Worker base URL: https://example-worker.example-subdomain.workers.dev
Health status: ok (ok)
Mock provider healthy: yes
Real providers disabled: yes

## Provider Readiness

| provider | role | enabled | status | can_search_live | blocking_reasons |
| --- | --- | ---: | --- | ---: | --- |
| amadeus | real_provider | false | disabled | false | real_providers_disabled, dry_run_enabled, credentials_missing |
| duffel | real_provider | false | disabled | false | real_providers_disabled, dry_run_enabled, credentials_missing |
| mock | demo_provider | true | healthy | false | none |

## Deal Label Counts

| deal_label | count |
| --- | ---: |
| strong_deal | 2 |
| suspected_deal | 2 |
| no_deal | 5 |

## Top Strong Deals

| route | score | dates | price | baseline median | discount | provider | last verified |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| SZB -> NRT | 94 | 2026-07-25 to 2026-07-30 | RM453.00 | RM700.00 | 35.29% | mock | 2026-06-10T08:00:00.000Z |
| KUL -> BKK | 90 | 2026-07-25 to 2026-07-30 | RM441.00 | RM630.00 | 30% | mock | 2026-06-10T08:00:00.000Z |

## Top Suspected Deals

| route | score | dates | price | baseline median | discount | provider | last verified |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| KUL -> TPE | 71 | 2026-07-25 to 2026-07-30 | RM459.00 | RM580.00 | 20.86% | mock | 2026-06-10T08:00:00.000Z |
| JHB -> BKK | 70 | 2026-07-25 to 2026-07-30 | RM440.00 | RM550.00 | 20% | mock | 2026-06-10T08:00:00.000Z |

## Safety Notes

- This example uses mock/demo data only.
- Real providers remain disabled.
- No admin token, provider credential, Telegram token, raw provider payload, booking, order, payment, ticket, passport, or passenger identity data is included.


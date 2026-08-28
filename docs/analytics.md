# Production Analytics (Phase 4)

## Provider

Google Analytics 4 via `gtag.js` (async, non-blocking).

## Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 measurement ID (`G-XXXXXXXXXX`). Required for production tracking. |
| `NEXT_PUBLIC_GA_ALLOW_DEV` | Set to `1` only for local DebugView testing. |

Analytics does **not** fire on `localhost` unless `NEXT_PUBLIC_GA_ALLOW_DEV=1`.

## Core events

| Event | Definition |
|-------|------------|
| `page_view` | Client route change; admin routes excluded |
| `registration_started` | Valid registration form submit attempt (after client validation) |
| `registration_completed` | `/api/auth/register` returned success |
| `login_completed` | Session applied after successful login API |
| `subscription_viewed` | `/subscriptions` viewed once per visit (guest or authenticated) |
| `subscription_cta_clicked` | User opened subscription request modal from a plan |
| `subscription_plan_selected` | Same moment as CTA — plan chosen |
| `payment_proof_started` | Valid payment proof file selected |
| `payment_proof_submitted` | `/api/subscription-request/finalize` returned success |
| `telegram_cta_clicked` | Official Telegram channel link clicked |

## PII rule

Never send email, password, tokens, UUIDs, Telegram handles, or payment proof data in event properties.

## UTM format

```
?utm_source=telegram&utm_medium=social&utm_campaign=launch
?utm_source=x&utm_medium=social&utm_campaign=launch
?utm_source=youtube&utm_medium=social&utm_campaign=launch
```

## Authoritative business counts

Registration/subscription activation counts in admin/DB remain source of truth. Analytics may under-count due to ad blockers.

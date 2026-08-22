# Email Audience, Consent & Preference Policy (Phase E3)

Central policy for HasaN CharT World email sending. **Backend is source of truth.**

## Classification

| Category | Purpose | Marketing consent required |
|----------|---------|---------------------------|
| `transactional` | Account, subscription, analysis, alerts, security | No |
| `marketing` / `bulk` | Promotions, newsletters, campaigns, re-engagement | **Yes — explicit opt-in** |
| `service_announcement` | Material service/terms/security changes (not promotional) | No |

Promotional CTAs (`اشترك الآن`, new product sales) are **never** `service_announcement`.

## Policy engine

Use `evaluateEmailSendPolicy()` from `lib/email-policy/`:

```js
import { evaluateEmailSendPolicy } from "../lib/email-policy/index.js";

const result = await evaluateEmailSendPolicy(supabase, {
  userId,
  email,
  category: "marketing",
  messageType: "email_campaign",
});
// result.allowed, result.consentRequired, result.consentSatisfied, result.suppressed
```

Producers must **not** implement ad-hoc consent checks. Wrap legacy code via `evaluateEmailRecipient()`.

## Marketing consent rules

- **No implicit consent**: signup alone, paid subscription, or site usage ≠ marketing opt-in.
- **Affirmative action only**: signup checkbox (unchecked default), account toggle, or audited admin/test flow.
- **Legacy users**: default **NOT opted in**. **Never** backfill `marketing_opt_in = true`.
- Evidence stored in `email_marketing_preferences`: `opted_in_at`, `opted_out_at`, `global_unsubscribed_at`, `source`, `policy_version`, `metadata`.

## Suppression precedence

1. **Hard suppression** (blocks even transactional where policy applies): hard bounce, complaint, invalid address, provider suppression, admin block.
2. **Marketing preference**: opted out / global unsubscribe — user may re-opt-in from account if no hard suppression.

Re-opt-in clears `global_unsubscribed_at` but **does not** remove hard suppressions.

## Unsubscribe / re-subscribe

- Campaign/list unsubscribe → `marketing_opt_in = false`, `global_unsubscribed_at` set, `source = email-unsubscribe`.
- Account re-enable → explicit new opt-in with fresh `opted_in_at`, clears global unsubscribe.

## Campaign eligibility

- Campaign category defaults to **`marketing`**; PATCH cannot set `transactional`.
- Audience snapshot applies current policy; **launch re-runs snapshot** before enqueue.
- Admin UI shows aggregate counts and exclusion reasons (no email lists on aggregate screens).

## User surfaces

- Signup: optional marketing checkbox (not required for account creation).
- Dashboard: email preferences toggle + non-blocking opt-in card for legacy users.
- API: `PUT /api/user/email-preferences` — session-derived `user_id` only.

## Tests

```bash
node scripts/test-email-policy-e3.js
```

## Policy version

Current: `E3-2026-08-28` (`EMAIL_CONSENT_POLICY_VERSION`).

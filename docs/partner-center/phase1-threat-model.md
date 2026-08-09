# Partner Center Phase 1 — Threat Model & Architecture

## End-to-end flow (target state)

```
Visitor
  → Referral / Smart Link (/r/{code}?campaign=…&source=…)
  → Click (partner_attribution_sessions + partner_events.referral_click)
  → Signup (partner_referrals + partner_referral_attributions + qualification.signup)
  → Verification / Qualification (partner_referral_qualifications state machine)
  → Customer (service activation → qualified)
  → Revenue Event (subscription/payment — existing hooks)
  → Commission / Reward (partner_commissions + partner_financial_ledger_entries)
  → Pending → Approved → Payable → Paid
  → Payout (partner_withdrawals + ledger payout entries)
```

## Trust boundaries

| Zone | Trust level | Notes |
|------|-------------|-------|
| Browser / cookies | Untrusted | Referral code format only; no payout decisions |
| Next.js API (service_role) | Trusted compute | All financial + qualification decisions |
| Postgres RLS | Enforcement | Partner self-read; admin via `iam_has_permission` |
| Client bundle | Zero secrets | No service role, no admin bypass |

## Threat mitigations (design-enforced)

| Threat | Mitigation |
|--------|------------|
| Self-referral | `getPartnerForReferredUser` + fraud BLOCK + qualification block path |
| Duplicate accounts / attribution | `partner_referrals.referred_user_id UNIQUE`, `partner_referral_attributions.referred_user_id UNIQUE`, event idempotency keys |
| Replay / duplicate events | `partner_events.idempotency_key UNIQUE`, ledger idempotency UNIQUE, commission dedupe index |
| Forged referral codes | Server validates against `partners.referral_code` + active status |
| Forged reward amounts | Amounts computed server-side from rules/tiers; client never supplies commission amount |
| API tampering (partnerId) | `assertPartnerOwnership` + RLS partner_id scope |
| IDOR | RLS + server checks partner.user_id === auth.uid() |
| Privilege escalation | IAM assignment-based permissions; no legacy is_admin bypass in new paths |
| Race: duplicate commission | DB unique `(partner_id, user_id, service_type, source_id)` + ledger unique on commission credit |
| Race: duplicate qualification | Optimistic `UPDATE … WHERE state = current` + transition audit |
| Double payout | `partner_wallet_ledger_withdrawal_paid_unique` + withdrawal status gates |
| Refund / chargeback | Event types reserved; reversals via compensating ledger entries (Phase 1 schema ready) |
| Cookie manipulation | First-touch cookie httpOnly; attribution finalized server-side at signup |
| Attribution hijacking | First-touch policy; no client overwrite after cookie set |
| Admin abuse | IAM permissions + audit via existing admin/IAM logs for financial ops |
| Campaign tampering | Campaign slug validated against `partner_campaigns` or stripped |

## Attribution policy

- **Model:** First-touch (matches existing referral cookie behavior)
- **Window:** 30 days (`DEFAULT_ATTRIBUTION_WINDOW_SECONDS`)
- **Invalid code:** Ignored; no attribution row
- **Existing cookie:** Preserved; no overwrite
- **Smart links:** `campaign/source/medium` stored as metadata only after validation; never used to calculate payout amounts

## Qualification state machine

```
signup → verified | qualified | disqualified
verified → qualified | disqualified
qualified → customer | disqualified
customer → disqualified
disqualified → (terminal)
```

Service commissions require existing referral + active partner; qualification transitions audited in `partner_qualification_transitions`.

## Ledger architecture

- **Append-only** `partner_financial_ledger_entries`
- Corrections via `reversal` entries referencing `reverses_entry_id`
- Legacy `partners.balance_*` maintained during transition; ledger mirrors new operations
- `reconcilePartnerLegacyBalances()` verifies consistency in tests

## Compatibility

- Existing `partner_commissions`, `partner_wallet_ledger`, balances unchanged for historical rows
- New bridge writes additive ledger + events alongside legacy flows
- No migration backfill required for Phase 1 local testing

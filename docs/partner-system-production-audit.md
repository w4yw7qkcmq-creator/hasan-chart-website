# Partner System — Production Audit & Architecture

## Architecture

```
Referral Capture → Registration Link → Partner Record
       ↓
Service Activation Hooks → Commission Engine → Wallet/Ledger
       ↓
Automation (Release, Upgrade, Bonus, Achievements) → Notifications
       ↓
Partner Center / Admin Center / Analytics RPC
```

- **Server-only DB access** via `service_role` (RLS enabled, no client access)
- **Business logic** in `lib/partner-*.js`
- **APIs** under `/api/partner/*` (authenticated users) and `/api/admin/partner*` (admin session)

## Database Flow

| Table | Purpose |
|---|---|
| `partners` | Balances, tier, counters |
| `partner_referrals` | Referred users |
| `partner_commissions` | Commission records + idempotency |
| `partner_withdrawals` | Withdrawal requests |
| `partner_wallet_ledger` | Financial audit trail |
| `partner_tiers` | Tier definitions |
| `partner_program_settings` | Automation toggles |
| `partner_notifications` | In-app notifications |
| `partner_user_achievements` | Unlocked badges |
| `partner_monthly_bonus_grants` | Monthly bonus idempotency |

## Partner Flow

1. Visitor hits `/?ref=CODE` or `/r/CODE` → cookie stored
2. User registers → referral linked, $0.20 signup bonus
3. User visits `/partner-center` → partner record created
4. Dashboard shows wallet, analytics, rewards, withdrawal

## Commission Flow

1. Service activated (admin dashboard hooks)
2. `createPartnerCommissionForService()` — idempotent by `(partner_id, user_id, service_type, source_id)`
3. Amount added to `balance_pending`
4. Automation may release to `balance_withdrawable` per `release_policy`
5. Ledger entry `commission_release` on release

## Withdrawal Flow

1. Partner requests ≥ 20 USDT (one active request max — DB unique index)
2. Status: pending → approved → paid
3. Balance deducted **only** on Mark as Paid (atomic `gte` check)
4. Ledger `withdrawal_request` on create, `withdrawal_paid` on pay

## Automation Flow

- **Auto Upgrade**: `evaluatePartnerTier()` after commissions / dashboard
- **Auto Release**: ON_SERVICE_ACTIVATION policies
- **Monthly Bonus**: Admin cron or manual `run-partner-bonus`
- **Achievements**: Evaluated on key events, unique per partner

## API Summary

### Partner (session required)
- `GET /api/partner/center` — dashboard
- `GET /api/partner/wallet` — wallet summary
- `GET /api/partner/analytics|charts|top-referrals|leaderboard|rewards`
- `POST /api/partner/withdraw` — rate limited
- `GET /api/partner/withdrawals`

### Admin (admin session required)
- `GET /api/admin/partners`, `GET /api/admin/partners/[id]`
- `GET /api/admin/partner-withdrawals`, approve/reject/mark-paid
- `GET /api/admin/partner-analytics`, `top-partners`, `timeline`
- `GET|POST /api/admin/partner-settings`
- `POST /api/admin/run-partner-bonus|run-partner-upgrade`
- `GET /api/admin/partner-health`

## Security Summary

- UUID validation on admin partner routes
- Rate limiting on withdrawal POST (in-memory; use edge/CDN for production scale)
- Input sanitization (wallet, notes, amounts)
- Auth: `requireSessionUser()` / `verifyAdminSession()`
- Service hooks: `verifyAdminOrCronSecret()`
- No raw SQL from user input — Supabase parameterized queries + RPC
- XSS: React escaping; user content sanitized before storage

## Deployment Notes

1. Apply all migrations `20260705` through `20260714` in order
2. Ensure `service_role` key is server-only
3. Set `PARTNER_LOG_LEVEL=info` (optional)
4. Schedule monthly bonus cron → `POST /api/admin/run-partner-bonus` with cron secret
5. Wire Sentry/analytics via `lib/partner-monitoring.js` hooks
6. Run `GET /api/admin/partner-health` after deploy

## Future Improvements

- Edge rate limiting (Redis/Upstash)
- Postgres transactions for multi-step financial ops
- Consolidate Partner Center API calls into single endpoint
- Email delivery via existing hooks
- Partner-facing notification read/mark API
- Profit-share auto-release on account management approval webhook

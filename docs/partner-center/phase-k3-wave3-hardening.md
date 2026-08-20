# Phase K.3 — Wave 3 Growth Hardening

**Date:** 2026-08-19  
**Scope:** Performance effective windows, atomic campaign budgets, leaderboard privacy/anti-gaming  
**Cash campaign activated:** NO  
**Leaderboard UI enabled:** NO  
**Commit:** `41cae12f88fcd31e29350412f8e3b036a1c85bf4`

## Blockers closed

1. Performance bonus engine now windowed via `computePerformanceMetricValue()` + `resolvePerformanceMetricWindow()`
2. Campaign global budget enforced atomically in `create_partner_growth_reward_atomic` (row lock + compare-and-update)
3. Partner leaderboard API returns public DTO only (no PII/private economics)
4. Leaderboard ranking uses HV-verified REAL qualified referrals within explicit period windows

## Migration

`supabase/migrations/20260824_partner_wave3_growth_hardening.sql`

- Adds `global_budget_amount`, `amount_spent`, `amount_reversed`, `per_partner_reward_cap` to `partner_campaign_programs`
- Reversal policy: gross `amount_spent` preserved; `amount_reversed` incremented; budget slots not released

## Production baseline (pre-K.3)

See `docs/partner-center/phase-k3-pre-wave3-baseline-20260819.json`

## Retroactivity audit

- `RETROACTIVE_PERFORMANCE_REWARDS_WOULD_TRIGGER`: 0 (0 active performance rules)
- `RETROACTIVE_CAMPAIGN_REWARDS_WOULD_TRIGGER`: 0 (Wave 2 campaign non-financial, 0 participants)

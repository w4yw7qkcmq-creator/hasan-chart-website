# Phase K.1 — Wave 2 Hardening (Milestone Effective Windows)

**Date:** 2026-08-19  
**Verdict:** WAVE 2 HARDENING PASS — milestone effective windows enforced; production retroactivity audit = 0

## Root cause

`evaluateMilestonesForPartner()` computed **all-time** partner metrics via `computePartnerMetrics()` and compared them to `threshold_value`. It never applied `effective_from` / `effective_to` to the metric itself.

A milestone created today with `threshold_value = 10` could grant immediately if the partner already had 10+ historical qualified referrals.

Wave 1 was safe at go-live because all partners had **0** qualifying history at activation (`2026-08-19T17:45:51.162Z`).

## Fix

1. **`resolveMilestoneMetricWindow(milestone)`** — window start = `effective_from || created_at`; end = `effective_to`.
2. **`computeMilestoneMetricValue()`** — time-bounded counts per metric:
   - `qualified_referrals` → `partner_referral_qualifications.qualified_at`
   - `customers` / `first_customer` → `partner_qualification_transitions.created_at` where `to_state = customer`
   - `confirmed_revenue` → commission ledger credits by `created_at`
3. **`milestone-engine.js`** — uses windowed metric value; skips milestones outside `isWithinWindow(effective_from, effective_to)`; snapshots include `milestoneMetricValue` + `milestoneWindow`.

## Policy semantics

| Field | Semantics |
|-------|-----------|
| `effective_from` | Only activity at/after this timestamp counts toward completion |
| `effective_to` | Activity after this timestamp does not count; milestone not earnable after window ends |
| Missing `effective_from` | Falls back to `created_at` (definition did not exist earlier) |

Wave 1 milestones (`wave1_ms10_qualified`, `wave1_ms25_qualified`) already have `effective_from = Phase K activation`.

## Schema / migration

**None.** Existing timestamps are sufficient.

## Tests

| Suite | Result |
|-------|--------|
| `scripts/test-milestone-effective-window.mjs` | **12 passed, 0 failed** |
| `scripts/test-partner-center-phase2.js` | **6 passed, 0 failed** |
| `scripts/partner-center/test-db-integration-phase2.mjs` | 8 passed, 4 failed (pre-existing PGlite migration gaps: `completion_sequence`, `short_code`) |
| Milestone cases in phase2 integration | **PASS** (one-time grant + duplicate blocked) |

Retroactivity matrix covered: historical ignore, post-window progression, duplicate guard, threshold 25 + history, first_customer, confirmed_revenue, effective_to, paused/draft, concurrency ×10, all-time vs windowed metrics.

## Production retroactivity audit (read-only)

```
active_milestones: 2
active_partners: 17
existing_grants: 0
RETROACTIVE_GRANTS_WOULD_TRIGGER: 0
```

## Pre-deploy financial baseline

- commissions: 11 / $99.10
- ledger: 28 / signed $163.10
- entitlements: 0
- mission_progress: 0
- milestone_grants: 0

## Files changed

- `lib/partner-center/partner-metrics.js`
- `lib/partner-center/milestone-engine.js`
- `scripts/test-milestone-effective-window.mjs`
- `scripts/partner-center/milestone-retroactivity-audit.mjs`
- `scripts/partner-center/test-db-integration-phase2.mjs` (seed: `effective_from` + `qualified_at`)
- `scripts/partner-center/test-supabase-mock.mjs` (range filters + insert conflict handling)
- `scripts/partner-center/test-db-bootstrap.sql` (PGlite test bootstrap)

## Wave 2 GO/NO-GO

**GO** — safe to **design** new growth content (not created in this phase).

## Remaining follow-ups (non-blocking)

- PGlite test harness missing later migrations (`20260823+`) for full mission/smart-link integration regression locally.
- Mission engine still uses all-time metrics for some mission types (by design); milestones now differ intentionally.

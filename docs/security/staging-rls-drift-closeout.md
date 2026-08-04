# Staging RLS Drift — Closeout

## Summary

Supabase Security Advisor on **Staging** (`tvkhuijufhnpqpchkyss`) reported `rls_disabled_in_public` (ERROR) for two public tables. RLS was enabled directly on Staging using a **manual, environment-specific** change. This repository documents the resolution and provides a **read-only validation script** — it does **not** ship a migration to `main`, because Production does not need the same change.

## Why Staging Alerted

Staging had RLS **disabled** on:

| Table | Role |
|---|---|
| `public.admin_logs` | Legacy IAM/admin audit dual-write target (active, sensitive) |
| `public.account_management_status_backfill_20260722` | Empty rollback artifact from `20260722_account_management_confirmed_active_backfill` |

Both tables had default grants for `anon` / `authenticated` / `service_role`. Without RLS, PostgREST could expose rows to client roles despite application intent.

## What Was Done on Staging (DB — not in Git)

Applied **service-only RLS** pattern:

- `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
- **No** policies for `anon` or `authenticated`
- **No** grant/ownership/data changes
- `service_role` continues to bypass RLS

Post-check (Staging):

| Table | RLS | Policies | Rows |
|---|---|---|---|
| `admin_logs` | ON | 0 | 305 (unchanged) |
| `account_management_status_backfill_20260722` | ON | 0 | 0 (unchanged) |

Security Advisor: `rls_disabled_in_public` → **resolved** for both tables.

## Production Read-Only Audit

Production (`lzgsxdsumnteuwtjfqlm`) was audited read-only. **No Production migration required.**

| Table | Production state |
|---|---|
| `admin_logs` | Exists, RLS **ON**, 0 policies, 115 rows — already service-only |
| `account_management_status_backfill_20260722` | **Does not exist** (backfill migration never applied) |

Verdict: **NO PRODUCTION ACTION REQUIRED**

## Intentional Environment Drift

| Dimension | Staging | Production |
|---|---|---|
| `admin_logs` row count | 305 | 115 |
| Backfill table | Present (empty) | Absent |
| RLS on `admin_logs` | ON (after manual fix) | ON (pre-existing) |
| Repo migration for this fix | **None** | **None** |

Drift is **documented and expected**. Staging carries rollback artifacts and higher test volume; Production never created the backfill table.

## `rls_enabled_no_policy` (INFO)

After enabling RLS with zero user policies, Supabase Security Advisor may show **INFO** `rls_enabled_no_policy`. This is **expected** for service-only tables (same pattern as `admin_audit_logs`, `iam_audit_logs`, etc.):

- RLS ON blocks `anon` / `authenticated` (empty result set via PostgREST)
- `service_role` bypasses RLS for server-side writers/readers

## Application Access Pattern

All `admin_logs` usage in this codebase is **server-side** via `getSupabaseAdmin()` / service role:

- `lib/iam/audit.js` (dual-write)
- `lib/admin-audit-log.js`, `lib/admin-activity-feed.js`
- `lib/admin-subscription-request-timeline.js`, admin API routes

No browser Supabase client reads/writes `admin_logs`. `/api/iam/audit` reads `iam_audit_logs`, not `admin_logs`.

## Validation (Read-Only)

```bash
node scripts/staging-rls-public-fix-validate.mjs --project-ref=tvkhuijufhnpqpchkyss
```

Requires `.env.staging.local`. Rejects Production ref. Outputs counts/status only — no row payloads, no secrets.

## Rollback (Staging only — emergency)

Use only if server-side admin/IAM paths break:

```sql
ALTER TABLE public.admin_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_management_status_backfill_20260722 DISABLE ROW LEVEL SECURITY;
```

Not automated; not in this repository.

## Git / Migration Policy

- **Do not** add `20260805_staging_enable_rls_on_unprotected_public_tables.sql` (or similar) to `main`.
- Staging DB state is the source of truth for this fix.
- Production compliance predates this closeout.

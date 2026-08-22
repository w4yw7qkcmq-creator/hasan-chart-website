# Enterprise IAM/RBAC — Production Rollout Runbook

**Scope:** Production database + application flags only.  
**Out of scope:** Merge to main, automatic legacy deletion, Staging data changes.  
**Validated reference:** Staging (`tvkh***kyss`) — IAM DB/API/UI/RLS enforced, 43 enforce policies, 18 own/public policies, rollback drill PASS.

---

## A. Preconditions

### A.1 Backup & window

- [ ] Full Postgres backup (Supabase dashboard → Database → Backups) verified < 24h or on-demand snapshot taken.
- [ ] Maintenance window scheduled (recommended: 30–60 min low-traffic).
- [ ] Rollback operator assigned (name: ________________).
- [ ] On-call engineer available for 2h post-activation.

### A.2 Feature flags (Production must start here)

All IAM flags **false** before any migration:

| Flag | Initial value |
|------|---------------|
| `IAM_DB` | `false` |
| `IAM_API` | `false` |
| `IAM_UI` | `false` |
| `IAM_RLS` | `false` |

Legacy paths (`is_admin()`, `admin_role`, email allowlist) remain active until flags are enabled in order.

### A.3 Staging parity

- [ ] Branch `feat/enterprise-iam-rbac` reviewed and approved.
- [ ] Migration checksums match Staging validated set (see dry-run checklist).
- [ ] Staging live RLS: 30/30 PASS (artifact reference only — do not re-run unless code signature changes).

### A.4 Production admin inventory

Before migration, export:

```sql
SELECT p.id, p.email, p.role, p.admin_role, au.email AS auth_email
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
WHERE p.admin_role IS NOT NULL OR p.role IN ('admin','support','accountant','analyst')
   OR p.email IN (SELECT unnest(string_to_array(current_setting('app.settings', true), ','))); -- adjust per env
ORDER BY p.email;
```

Record:

- [ ] Owner email (`IAM_OWNER_EMAIL`): ________________
- [ ] Current legacy admins count: ______
- [ ] Accounts with admin_role but no auth user: ______
- [ ] Duplicate assignment candidates: ______

### A.5 Rollback operator checklist

- [ ] Access to Supabase SQL editor / CLI (Production ref only).
- [ ] Access to Production env vars (Vercel/hosting).
- [ ] `20260804_iam_rls_rollback.sql` reviewed.
- [ ] `20260804_iam_rls_emergency_disable.sql` reviewed (break-glass only).

---

## B. Secret preparation

**Never commit secrets to Git.**

| Secret / config | Purpose | Set where |
|-----------------|---------|-----------|
| `IAM_BOOTSTRAP_SECRET` | One-time super_admin ceremony | Production env (temporary) |
| `IAM_BOOTSTRAP_EXPIRES_AT` | Bootstrap window end (ISO8601) | Production env |
| `IAM_BOOTSTRAP_ALLOWED_IPS` | Optional IP allowlist (comma-separated) | Production env |
| `IAM_OWNER_EMAIL` | Owner → super_admin backfill target | Production env |
| Service account secrets | Machine auth per worker | Worker env only (later phase) |

Service accounts (DB rows, `enabled=false` by default):

| ID | Label | Enable before |
|----|-------|---------------|
| `cron` | Scheduled jobs | Before `IAM_API=true` if cron routes used |
| `news-worker` | News pipeline | Before worker IAM cutover |
| `price-alert-worker` | Price alerts | Before worker IAM cutover |
| `instant-analysis-worker` | Instant analysis *(retired Aug 2026)* | Historical IAM record only |
| `telegram-bot` | Telegram dispatch | Before bot IAM cutover |

Generate secrets offline (32+ bytes, base64url). Store in password manager. Hash inserted via admin tooling or controlled SQL — **not** in repo.

After bootstrap completes: **remove** `IAM_BOOTSTRAP_SECRET` from Production env.

---

## C. Migration order

Apply via Supabase migration pipeline or controlled `supabase db push` against **Production ref only**.

### Phase C1 — Schema foundation (flags OFF)

| Order | Migration file | Notes |
|-------|----------------|-------|
| 1 | `20260804_iam_rbac_foundation.sql` | Tables, roles, permissions catalog, bootstrap state |
| 2 | `20260804_iam_rls_functions.sql` | `iam_has_permission`, health probe helpers |

**Verify after C1:**

```sql
SELECT count(*) FROM iam_roles;
SELECT count(*) FROM iam_permissions;
SELECT public.iam_rls_health_probe();
```

Expected: roles/permissions seeded; health probe returns JSON (RLS may be off).

### Phase C2 — RLS policy package (flags OFF, RLS still OFF on business tables)

| Order | Migration file | Notes |
|-------|----------------|-------|
| 3 | `20260804_iam_rls_dual_policies.sql` | Bridge policies (`is_admin() OR iam_has_permission`) — dormant until RLS enabled |
| 4 | `20260804_iam_rls_user_ownership_policies.sql` | Own-user + public read policies |
| 5 | `20260804_iam_rls_enforce_policies.sql` | 43 enforce policies — post-checks must PASS |
| 6 | `20260804_iam_rls_enable_business_tables.sql` | Enables RLS only when policies present |

**Do not enable `IAM_RLS` flag until C2 verified.**

Post-C2 SQL checks:

```sql
SELECT count(*) FILTER (WHERE policyname LIKE 'iam_enforce_%') AS enforce,
       count(*) FILTER (WHERE policyname LIKE 'iam_own_%' OR policyname LIKE 'iam_public_%') AS own_public,
       count(*) FILTER (WHERE policyname LIKE 'iam_dual_%') AS dual
FROM pg_policies WHERE schemaname = 'public';

SELECT relname, relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND relname IN (
  SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
);
```

Staging-validated targets: enforce=43, own/public=18, dual=0 after full enforce path.

### Phase C3 — Bootstrap (flags OFF)

1. Deploy application code with all IAM flags **false**.
2. Set bootstrap env vars (B.1).
3. Authenticated owner calls:

   `POST /api/iam/bootstrap`  
   Header: `x-iam-bootstrap-secret: <IAM_BOOTSTRAP_SECRET>`

4. Expect: `201` once; replay → `410`.
5. Verify:

```sql
SELECT * FROM iam_bootstrap_state WHERE id = true;
SELECT count(*) FROM iam_user_assignments
WHERE role_id = 'super_admin' AND revoked_at IS NULL;
```

Expected: `bootstrap.completed_at` set; `super_admin` count ≥ 1 for owner.

### Phase C4 — Backfill dry-run (flags OFF)

`POST /api/iam/health` with super_admin session:

```json
{ "action": "dry_run_backfill" }
```

Review mapping preview. Confirm:

- Owner → `super_admin` only (no extra super_admins).
- Legacy `admin_role` → catalog roles.
- No duplicate active assignments for same user+role.

### Phase C5 — Backfill execute (flags OFF)

```json
{ "action": "execute_backfill" }
```

Re-run dry-run counts. Audit rows expected in `iam_audit_log`.

---

## D. Production admin mapping

| Source | Target role | Rule |
|--------|-------------|------|
| `IAM_OWNER_EMAIL` | `super_admin` | Exactly one owner super_admin |
| `profiles.admin_role = 'admin'` | `admin` | Via backfill |
| `profiles.admin_role = 'support'` | `support` | Via backfill |
| `profiles.admin_role = 'accountant'` | `accountant` | Via backfill |
| `profiles.admin_role = 'analyst'` | `analyst` | Via backfill |
| Legacy email allowlist | Mapped per `legacy-auth.js` | Dual-read until flags on |
| No auth user | Skip with audit note | Manual follow-up |

**Never** auto-grant `super_admin` except owner bootstrap/backfill path.

**Last super_admin protection:** `grant-revoke.js` blocks revoke if count would reach 0.

---

## E. Smoke checks after each stage

| Stage | Checks |
|-------|--------|
| After C1 | `/api/health` 200; IAM tables exist |
| After C2 | Policy counts; `iam_rls_health_probe()` JSON |
| After C3 | Bootstrap state; owner can login |
| After C4–C5 | Assignment counts; audit entries |
| After `IAM_DB=true` | `/api/iam/me` returns roles for admin |
| After `IAM_API=true` | Non-privileged admin gets 403 on finance; audit deny events |
| After `IAM_UI=true` | Admin nav filtered; direct URL to `/admin/iam` guarded |
| After `IAM_RLS=true` | User reads own profile; cannot read others; admin with permission can |

Manual smoke script (owner session):

1. Login → `/admin` dashboard loads.
2. Finance center (if permitted).
3. Subscriptions admin action (if permitted).
4. News admin (if permitted).
5. `POST /api/iam/sessions` force_logout test account → re-login denied until restored.
6. Normal user: `/admin` → 403/forbidden; no admin JSON leakage.

---

## F. Feature flag rollout

Enable **one flag at a time**. Wait ≥ 15 min between stages. Monitor error rates.

| Step | Flag | Depends on | Rollback trigger |
|------|------|------------|------------------|
| F1 | `IAM_DB=true` | C1 complete | Resolver errors > 1% admin requests |
| F2 | `IAM_API=true` | F1 + backfill | 403 spike > 5% admin traffic |
| F3 | `IAM_UI=true` | F2 | Admin lockout / blank admin shell |
| F4 | `IAM_RLS=true` | F2 + C2 complete | Own-data denial / data exposure |

Between steps: run CV checkpoint (`npm run cv:checkpoint` against Production dry-run config).

**Rollback criteria (any):**

- Admin lockout (no super_admin can access `/admin`).
- 403 rate > 5% sustained 10 min on admin APIs.
- RLS recursion / DB CPU spike on policy functions.
- Audit writer failure with permission denials blocking ops.

---

## G. Rollback

### G1 — Application flags (fastest)

Reverse order:

1. `IAM_RLS=false`
2. `IAM_UI=false`
3. `IAM_API=false`
4. `IAM_DB=false`

Redeploy / env refresh. Legacy `is_admin()` path resumes.

### G2 — RLS rollback migration

Apply: `20260804_iam_rls_rollback.sql`

- Drops `iam_enforce_*` policies.
- Restores `iam_dual_*` (`is_admin() OR iam_has_permission`).
- **Preserves** own-user/public policies.

Optional: `20260804_iam_rls_emergency_disable.sql` — disables RLS on business tables (break-glass; may expose rows if own policies insufficient — use only with ops approval).

### G3 — Data preservation

- **Do not** delete `iam_user_assignments`, audit logs, or bootstrap state during rollback.
- **Do not** delete legacy columns or `is_admin()`.

### G4 — Verification after rollback

- Admin access via legacy path restored.
- Policy counts: dual > 0, enforce = 0 (if full RLS rollback).
- User own-data access still works.

---

## H. Incident triggers

| Signal | Severity | Action |
|--------|----------|--------|
| 403 spike > 5% admin | P1 | Flags reverse G1; investigate matrix |
| Admin lockout | P0 | G1 immediately; super_admin session restore |
| Auth 401/500 spike | P1 | Check session cookies, Supabase auth |
| RLS recursion / statement timeout | P0 | `IAM_RLS=false`; consider G2 |
| Audit insert failures | P2 | Monitor; fix writer permissions |
| Worker cron 403 | P1 | Service account secret / IAM_API transition |
| DB latency P95 > 2x baseline | P2 | Review permission resolver queries |
| User cannot read own profile | P0 | `IAM_RLS=false`; G2 |
| Cross-user data visible | P0 | `IAM_RLS=false`; G2 + incident bridge |

---

## I. Post-deploy verification

| Time | Action |
|------|--------|
| T+1m | `/api/health`, `/api/iam/health`, owner login |
| T+5m | CV checkpoint; admin API sample |
| T+15m | Error budget; 403 rate; audit writes |
| T+1h | Ops dashboard; security events review |
| T+6h | Session log volume; cache hit ratio |
| T+24h | Full CV run; compare to baseline |

Monitor:

- `iam.permission_denied` security events rate
- `iam_audit_log` insert rate
- Postgres slow queries on `iam_user_assignments`, `iam_role_permissions`
- `/api/iam/me` latency

---

## J. Cleanup (after stable 7d)

- [ ] Remove `IAM_BOOTSTRAP_SECRET`, `IAM_BOOTSTRAP_EXPIRES_AT`, `IAM_BOOTSTRAP_ALLOWED_IPS` from Production.
- [ ] Confirm bootstrap state `completed_at` set (do not reset).
- [ ] Archive rollout reports to ops storage (not Git).
- [ ] Keep legacy `is_admin()`, `admin_role`, email allowlist until final deprecation phase.
- [ ] Plan service account enablement per worker (separate change tickets).
- [ ] Do **not** delete Staging test data or Production legacy columns in this phase.

---

## Migration checksum reference (repo)

```
33616c21a4662f5410ef59f84a64f7c8433c3523bdfbcd9f1ea3734e6e78cbdd  20260804_iam_rbac_foundation.sql
e70c8c531dbc6b138e65e49534490731b341f90d819d75e542a90a8972307d8d  20260804_iam_rls_functions.sql
47ac51728c1baecda1c73e95a0a10591f53744bbd479d59d7baa39309634bb98  20260804_iam_rls_dual_policies.sql
de0a7e42687c7c3b52dc21c1150a5bdf63017d9d3f2430475640ab6401992c2f  20260804_iam_rls_user_ownership_policies.sql
c46f214802d6e0cf5e482ac093dbb2dd95f6172a63dd7ecb1add860e9804372c  20260804_iam_rls_enforce_policies.sql
44d444a3cf18cd2294a9bfd82347c1b7914fa4488d0a0a1c3ef95c9fc8e3bd0f  20260804_iam_rls_enable_business_tables.sql
27c0f7ff9adbf85dd8b18b6ef3046c1f52d820009c7c5955fa002175192c348a  20260804_iam_rls_rollback.sql
acd9286c26fa58cea1c09111108bfc85feb1f6805020ad98b5225038fcdbb310  20260804_iam_rls_emergency_disable.sql
```

---

## Emergency contacts

| Role | Name | Contact |
|------|------|---------|
| Rollback operator | | |
| DB owner | | |
| App owner | | |

**Document version:** 2026-08-04 — aligned with `feat/enterprise-iam-rbac` (6 commits).

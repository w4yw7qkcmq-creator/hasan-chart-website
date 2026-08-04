# Enterprise IAM/RBAC — Production Dry-Run Checklist

**Purpose:** Read-only / no-write validation before Production migration.  
**Environment:** Production database (SELECT only) + local repo + Staging artifacts as reference.  
**Do not:** Apply migrations, change env vars, or enable flags during this checklist.

---

## 1. Operator sign-off

| Field | Value |
|-------|-------|
| Date | |
| Operator | |
| Reviewer | |
| Production project ref | `lzgs***fqlm` (verify in dashboard) |
| Branch reviewed | `feat/enterprise-iam-rbac` @ `6c7bceb` |
| Staging validation date | 2026-08-04 |

Signatures:

- [ ] Operator: ________________ Date: ______
- [ ] Reviewer: ________________ Date: ______

---

## 2. No-write inventory (Production)

Run read-only queries only.

### 2.1 Current IAM state (expect empty pre-migration)

```sql
SELECT to_regclass('public.iam_roles') IS NOT NULL AS has_iam_roles;
SELECT to_regclass('public.iam_user_assignments') IS NOT NULL AS has_assignments;
SELECT count(*) FILTER (WHERE policyname LIKE 'iam_enforce_%') AS enforce,
       count(*) FILTER (WHERE policyname LIKE 'iam_dual_%') AS dual,
       count(*) FILTER (WHERE policyname LIKE 'iam_own_%') AS own
FROM pg_policies WHERE schemaname = 'public';
```

| Check | Expected pre-migration | Actual |
|-------|------------------------|--------|
| `iam_roles` table | false | |
| enforce policies | 0 | |
| dual policies | 0 | |
| own policies | 0 | |

### 2.2 Legacy admin inventory

```sql
SELECT admin_role, count(*) FROM profiles
WHERE admin_role IS NOT NULL GROUP BY 1 ORDER BY 1;

SELECT count(*) FROM profiles p
WHERE p.admin_role IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
```

| Metric | Value |
|--------|-------|
| Total legacy admins | |
| By admin_role breakdown | |
| Profiles without auth user | |

### 2.3 Business table row counts (baseline)

Record for post-migration comparison:

```sql
SELECT 'profiles' AS t, count(*) FROM profiles
UNION ALL SELECT 'subscription_requests', count(*) FROM subscription_requests
UNION ALL SELECT 'daily_analysis', count(*) FROM daily_analysis;
```

| Table | Count |
|-------|-------|
| profiles | |
| subscription_requests | |
| daily_analysis | |

---

## 3. Migration checksums (repo vs Staging validated)

Verify local files match before Production apply:

| File | SHA-256 | Match Staging? |
|------|---------|----------------|
| `20260804_iam_rbac_foundation.sql` | `33616c21…cbdd` | ☐ |
| `20260804_iam_rls_functions.sql` | `e70c8c53…7d8d` | ☐ |
| `20260804_iam_rls_dual_policies.sql` | `47ac5172…bb98` | ☐ |
| `20260804_iam_rls_user_ownership_policies.sql` | `de0a7e42…4372c` | ☐ |
| `20260804_iam_rls_enforce_policies.sql` | `c46f2148…4372c` | ☐ |
| `20260804_iam_rls_enable_business_tables.sql` | `44d444a3…bd0f` | ☐ |
| `20260804_iam_rls_rollback.sql` | `27c0f7ff…348a` | ☐ |
| `20260804_iam_rls_emergency_disable.sql` | `acd9286c…b310` | ☐ |

Local verify command:

```bash
shasum -a 256 supabase/migrations/20260804_*.sql
```

---

## 4. Admin mapping preview

Set `IAM_OWNER_EMAIL` (Production value — **do not write in this doc**).

| Email | Legacy source | Expected role | Notes |
|-------|---------------|---------------|-------|
| (owner) | IAM_OWNER_EMAIL | super_admin | Bootstrap + backfill |
| | admin_role | admin | |
| | admin_role | support | |
| | email allowlist | per legacy-auth | |

Dry-run command (Staging pattern — run against Production **after** foundation migration only):

```json
POST /api/iam/health
{ "action": "dry_run_backfill" }
```

Preview output reviewed: ☐ Yes ☐ N/A (pre-migration)

---

## 5. Expected post-migration targets

From Staging validation (reference):

| Metric | Target |
|--------|--------|
| Active super_admin assignments | 1 (owner) + manual grants only |
| Enforce RLS policies | 43 |
| Own/public RLS policies | 18 |
| Dual policies (after full enforce) | 0 |
| RLS-enabled core business tables | All in inventory (22 tables) |
| Bootstrap completed | true (after ceremony) |
| `iam_rls_health_probe().rlsEnabled` | true (after enable + IAM_RLS) |

---

## 6. Static validation (local, no Production writes)

```bash
npm run test:iam:routes      # route matrix 0 mismatches
npm run test:iam:page-guards # page matrix 0 issues
npm run test:iam:rls-static
npm run test:iam:rls-coverage
npm run test:iam:rls-simulation
```

| Script | Result | Date |
|--------|--------|------|
| test:iam:routes | PASS (57 covered, 0 issues) | |
| test:iam:page-guards | PASS | |
| test:iam:rls-static | PASS | |
| test:iam:rls-coverage | PASS (43 enforce expected) | |
| test:iam:rls-simulation | PASS | |

---

## 7. Rollback command list (prepare, do not run)

| Step | Command / action |
|------|------------------|
| 1 | Set `IAM_RLS=false`, redeploy |
| 2 | Set `IAM_UI=false`, redeploy |
| 3 | Set `IAM_API=false`, redeploy |
| 4 | Set `IAM_DB=false`, redeploy |
| 5 | Apply `20260804_iam_rls_rollback.sql` |
| 6 | Verify dual policies restored, enforce = 0 |
| 7 | Break-glass only: `20260804_iam_rls_emergency_disable.sql` |

Rollback tested on Staging: ☐ Yes (2026-08-04 drill PASS)

---

## 8. Secret readiness (names only)

| Variable | Prepared | Stored securely |
|----------|----------|-----------------|
| IAM_BOOTSTRAP_SECRET | ☐ | ☐ |
| IAM_BOOTSTRAP_EXPIRES_AT | ☐ | ☐ |
| IAM_BOOTSTRAP_ALLOWED_IPS | ☐ | ☐ |
| IAM_OWNER_EMAIL | ☐ | ☐ |
| STAGING_IAM_TEST_PASSWORD | N/A Production | |

Service account secrets (future worker phase):

| Account | Secret prepared |
|---------|-----------------|
| cron | ☐ |
| news-worker | ☐ |
| price-alert-worker | ☐ |
| instant-analysis-worker | ☐ |
| telegram-bot | ☐ |

---

## 9. Production ref guard

Live test scripts must refuse Production:

```bash
# Must fail or skip without STAGING project ref
node scripts/iam/test-rls-staging.mjs --live
```

Confirm `lib/staging-env-guard.js` blocks Production ref: ☐ Reviewed

---

## 10. Staging artifact references (read-only)

| Artifact | Result |
|----------|--------|
| `scripts/iam/.artifacts/rls-live-postapply-*.json` | 30/30 PASS |
| `scripts/iam/.artifacts/browser-qa-final-gate.json` | FULL BROWSER QA VALIDATED |
| Rollback drill | PASS → re-apply PASS |

Code signature at validation: `8bebc9107ad1b94f` (do not re-run live QA unless changed).

---

## 11. Go / no-go

| Criterion | Status |
|-----------|--------|
| PR human review complete | ☐ |
| Checksums match Staging | ☐ |
| Admin inventory exported | ☐ |
| Rollback operator assigned | ☐ |
| Maintenance window scheduled | ☐ |
| All IAM flags false in Production | ☐ |
| Backup verified | ☐ |

**Dry-run verdict:** ☐ GO for migration planning ☐ HOLD

**HOLD reason (if any):**

---

## 12. Related documents

- [IAM README](./README.md)
- [Production Rollout Runbook](./production-rollout-runbook.md)

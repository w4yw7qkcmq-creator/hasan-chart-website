# Enterprise IAM/RBAC — Production Runbook & Closure Record

**Status:** IAM PROJECT CLOSED
**Closure date:** 2026-08-04
**Production commit:** `70adc4d` (includes RLS purge migration + canary tooling)
**Production URL:** https://www.hasanchartworld.com
**Supabase project ref:** `lzgsxdsumnteuwtjfqlm`
**Railway service:** `hasan-chart-website` (project: calm-energy)

---

## 1. Current production architecture

Enterprise IAM is fully enabled on Production:

| Layer | Mechanism |
|-------|-----------|
| Human auth | Supabase session cookies → `requireAdminSession` → active `iam_user_assignments` |
| API enforcement | `IAM_API=true` — legacy `profiles.role` / `admin_role` **blocked** without assignment |
| UI enforcement | `IAM_UI=true` — admin pages gated by `ADMIN_PAGE_PERMISSIONS` |
| DB RLS | `IAM_RLS=true` — assignment-based `iam_enforce_*` + owner `iam_own_*` policies |
| Machine auth | `x-service-account-id` + `x-service-account-secret` when `IAM_API=true` |

**Legacy dual-read:** `resolveLegacyAdminContext` exists for rollback when `IAM_API=false` only. With all flags true, legacy admin fields do **not** grant API access.

---

## 2. Feature flags — expected Production values

| Flag | Production | Requires |
|------|------------|----------|
| `IAM_DB` | `true` | — |
| `IAM_API` | `true` | `IAM_DB` |
| `IAM_UI` | `true` | `IAM_DB` |
| `IAM_RLS` | `true` | `IAM_DB` + `IAM_API` |

Verify runtime (not just Railway desired):

```bash
curl -sS https://www.hasanchartworld.com/api/health | jq '.iam.effective'
```

Expected: all four `true`, `validation.ok=true`, `status=ok`, `readiness=ready`.

**Invalid combinations** are reported unhealthy by `validateIamFlagCombination()` (e.g. `IAM_RLS=true` without `IAM_DB`).

---

## 3. Human authorization flow

1. User authenticates via Supabase (session cookies `hc_access_token`, `hc_refresh_token`).
2. `requireAuthenticatedSession()` validates token + revocation registry.
3. `resolveIamContext()` loads active assignments → role permissions → effective Set.
4. When `IAM_API=true`: `hasActiveIamAssignment()` is **mandatory** — legacy profile admin without assignment → `403` (`legacy_blocked`).
5. `requirePermission(perm)` checks effective permissions (deny precedence supported in resolver).
6. UI: `AdminAccessGate` + `checkAdminPageAccess` when `IAM_UI=true`.

**Super admin:** exactly **1** active `super_admin` assignment expected on Production.

---

## 4. Machine authorization flow

1. Request presents `x-service-account-id` + `x-service-account-secret` (aliases: `x-iam-service-*`).
2. `verifyServiceIdentity()` loads account from DB, verifies `secret_hash` with pepper.
3. Permission checked against `iam_service_account_permissions`.
4. When `IAM_API=true`: legacy `Authorization: Bearer $CRON_SECRET` → **403** (headers required).
5. When `IAM_API=false`: legacy cron path still works (rollback mode).

**Production cron service account:**

| Field | Expected |
|-------|----------|
| ID | `cron` |
| enabled | `true` |
| secret_hash | NOT NULL |
| permissions | `[system.cron.read]` only |

Other accounts (`news-worker`, `price-alert-worker`, etc.): `enabled=false`, `secret_hash=NULL` until worker migration.

**`CRON_SECRET`:** retained on Railway for rollback — **not** an active bypass when `IAM_API=true`.

---

## 5. RLS model

Policies applied (Production):

1. `20260804_iam_rls_functions.sql` — helpers + health probe
2. `20260804_iam_rls_user_ownership_policies.sql` — owner/public read
3. `20260804120000_iam_rls_purge_legacy_open_policies.sql` — drop open/legacy policies
4. `20260804_iam_rls_enforce_policies.sql` — 43 `iam_enforce_*` policies
5. `20260804_iam_rls_enable_business_tables.sql` — enable RLS on 16 business tables

Health probe (`SELECT public.iam_rls_health_probe()`):

| Signal | Expected |
|--------|----------|
| enforcePoliciesPresent | `true` |
| missingOwnPolicy | `[]` |
| mixedDualEnforce | `false` |
| dualPoliciesPresent | `false` |
| policiesWithoutRls | `[]` |
| open legacy policies | `0` |
| legacy is_admin() policies | `0` |

Rollback SQL: `supabase/migrations/20260804_iam_rls_rollback.sql`
Emergency: `supabase/migrations/20260804_iam_rls_emergency_disable.sql`

---

## 6. Permission & role overview

Canonical permissions: `lib/iam/constants.js` → `IAM_PERMISSIONS` (54 IDs).

Roles: `super_admin`, `admin`, `analyst`, `support`, `accountant`, `news_editor`.

Route matrix: `lib/iam/route-permissions.js` — validated by `validateRouteMatrix()`:
- 57 admin routes discovered
- 54 static + 3 action mappings + 2 machine routes
- **0 issues**

Page guards: `lib/iam/page-permissions.js`

RLS permission map: `lib/iam/rls-permission-map.js`

---

## 7. Deployment & migration order

**Never skip order:**

1. Apply IAM DB migrations (foundation → functions → ownership → purge → enforce → enable RLS)
2. Bootstrap super_admin (`production-bootstrap-run.mjs` or API ceremony)
3. Backfill assignments (`production-backfill-dry-run.mjs` then execute if approved)
4. Enable flags in order: `IAM_DB` → `IAM_API` → `IAM_UI` → `IAM_RLS`
5. Run runtime-aware canaries after each flag

**Git ↔ DB sync:** migration SQL in `supabase/migrations/` is source of record. Applied versions recorded in `supabase_migrations.schema_migrations`.

---

## 8. Health & runtime probes

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Public — `iam.effective.*` runtime flags |
| `GET /api/iam/health` | Super admin — full readiness report, `rlsMode` |

Runtime probe: `lib/iam/runtime-probe.js` — flags read per-request (no stale env cache).

Canary scripts (sanitized artifacts):

- `scripts/iam/production-iam-api-canary.mjs`
- `scripts/iam/production-iam-ui-canary.mjs`
- `scripts/iam/production-iam-rls-canary.mjs`

---

## 9. Common failure diagnosis

| Symptom | Likely cause | Check |
|---------|--------------|-------|
| 403 on admin API with legacy admin | No active assignment | `iam_user_assignments`, `IAM_API=true` |
| 410 on cron route with IAM headers | Auth OK but missing route permission | cron has `system.cron.read` only |
| 403 legacy bearer when `IAM_API=true` | Expected — use service account headers | |
| Health `validation.ok=false` | Flag misconfiguration | `validateIamFlagCombination` |
| RLS denies legitimate owner | Missing `iam_own_*` policy | `iam_rls_health_probe()` |
| Mixed runtime flags | Railway redeploy in progress | Poll `/api/health` until stable (3 probes) |
| 401 session | Revoked assignment or expired session | revocation registry |

---

## 10. Rollback steps

### IAM_RLS only (safest first step)

```bash
# Railway
IAM_RLS=false
# Poll until runtime false stable
node scripts/iam/production-iam-rls-canary.mjs probe
```

DB policies remain enforced; flag is health/reporting layer.

### IAM_UI

```bash
IAM_UI=false
node scripts/iam/production-iam-ui-canary.mjs probe
```

### IAM_API

```bash
IAM_API=false
# Legacy CRON_SECRET bearer works again on cron routes
node scripts/iam/production-iam-api-canary.mjs probe
```

### RLS policy rollback (DB)

Apply `20260804_iam_rls_rollback.sql` via Supabase SQL editor **only** after flag rollback and with operator approval.

### Full IAM disable

Set all flags `false`. Legacy `is_admin()` / profile paths reactivate per pre-IAM behavior.

---

## 11. Secret rotation procedure

**Never commit secret values.**

| Secret | Location | Rotation |
|--------|----------|----------|
| `IAM_SERVICE_SECRET_PEPPER` | Railway Web | Re-hash all service account secrets via provisioning script |
| `IAM_CRON_SERVICE_SECRET` | Railway Web | Update DB hash + Railway var together |
| `CRON_SECRET` | Railway Web | Keep for rollback; rotate only with rollback plan |
| Service account secrets | Worker env (future) | Per-account independent rotation |

Provisioning reference: `scripts/iam/production-service-accounts-provision.mjs` (dry-run first).

---

## 12. Emergency super_admin recovery

1. Verify `IAM_DB=true` and schema present.
2. If no super_admin assignment: use bootstrap ceremony env vars (`IAM_BOOTSTRAP_SECRET`, `IAM_BOOTSTRAP_EXPIRES_AT`, `IAM_OWNER_EMAIL`).
3. Script: `scripts/iam/production-bootstrap-run.mjs` (requires local bootstrap env — never commit).
4. Verify: `GET /api/iam/me` shows `super_admin` + `hasActiveAssignment=true`.

---

## 13. Files & migrations of record

| Category | Path |
|----------|------|
| IAM core | `lib/iam/*` |
| Admin auth (delegates to IAM) | `lib/admin-auth.js` |
| Migrations | `supabase/migrations/20260804_*` |
| Tests | `scripts/test-iam-*.js`, `scripts/e2e/iam-smoke.test.mjs` |
| RLS validation | `scripts/iam/validate-rls-coverage.mjs` |
| Staging QA | `scripts/iam/staging-*.mjs`, `browser-qa-*.mjs` |
| Production ops | `scripts/iam/production-*.mjs` |
| Docs | `docs/iam/` |

---

## 14. Do-not-do list (post-closure)

- Do **not** delete `CRON_SECRET` without proven zero callers + rollback drill + explicit approval
- Do **not** squash applied migrations
- Do **not** enable disabled service accounts without worker auth migration
- Do **not** grant broad permissions to cron (keep `system.cron.read` only)
- Do **not** reintroduce `USING(true)` on sensitive tables
- Do **not** use `profiles.role=admin` as authorization when `IAM_API=true`
- Do **not** expose `SUPABASE_SERVICE_ROLE_KEY` in client/browser code

---

## 15. Environment guards

| Environment | Supabase ref | CLI link |
|-------------|--------------|----------|
| Production | `lzgsxdsumnteuwtjfqlm` | Verify before any SQL |
| Staging | `tvkhuijufhnpqpchkyss` | Default local link |

Always confirm project ref before `supabase db push` or MCP `apply_migration`.

---

## 16. Test commands (local quality gate)

```bash
npm run test:iam
npm run test:iam:security
npm run test:iam:routes
npm run test:iam:rls-static
npm run test:iam:rls-coverage
npm run test:iam:page-guards
npm run build
```

Staging live (requires credentials): `npm run test:iam:browser:gate`

---

## 17. Git ↔ Production synchronization checklist

- [ ] `git rev-parse HEAD` == `origin/main`
- [ ] `/api/health` build commit matches deployed commit
- [ ] `iam_rls_health_probe()` all PASS on Production
- [ ] Migration names in DB match repo SQL intent
- [ ] No untracked `production-*.mjs` canary scripts

---

## 18. Incident checklist

1. Check `/api/health` runtime flags (not Railway UI alone)
2. Check `/api/iam/health` as super_admin
3. Check Supabase logs for PostgREST policy errors
4. Check Railway logs for 5xx/auth spikes
5. Identify layer: flag / API / UI / RLS / machine
6. Rollback narrowest layer first (RLS flag → UI → API)
7. Document in security events (`iam_security_events`)

---

## Related documents

- `docs/iam/production-rollout-runbook.md` — historical rollout steps
- `docs/iam/production-dry-run-checklist.md` — pre-migration checklist
- `docs/iam/README.md` — architecture overview

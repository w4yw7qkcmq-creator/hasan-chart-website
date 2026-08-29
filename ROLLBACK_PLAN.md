# HasaN CharT World — Rollback Plan

Use this plan if a production deployment causes critical failures (5xx spike, auth broken, alerts not delivering, data corruption risk).

---

## 1. When to Rollback

Trigger rollback immediately if **any** of these occur within 30 minutes of deploy:

| Severity | Symptom | Action |
|----------|---------|--------|
| 🔴 Critical | `/api/health` returns 503 `database: down` | Rollback Web |
| 🔴 Critical | Login/register completely broken | Rollback Web |
| 🔴 Critical | Worker `/health` offline or crash-looping | Rollback Worker |
| 🔴 Critical | Price alerts stop delivering (Worker down) | Rollback Worker |
| 🟠 High | Push/email delivery 100% failing | Rollback Worker + check VAPID/Resend |
| 🟠 High | Admin dashboard 500 on all routes | Rollback Web |
| 🟡 Medium | Single page 404/500 (non-critical) | Hotfix forward — no full rollback |

---

## 2. Pre-Deploy Preparation

Before every deploy, record:

```
ROLLBACK_COMMIT=<last-known-good git SHA>
ROLLBACK_WEB_IMAGE=<Railway deployment ID, if available>
ROLLBACK_WORKER_IMAGE=<Railway deployment ID, if available>
DEPLOY_TIME=<ISO timestamp>
DEPLOYED_BY=<name>
```

Store in deploy notes or Railway deployment history.

**Last known good baseline:** the commit that passed `npm run build` + `PREFLIGHT_STRICT=1 npm run check` on production env immediately before this deploy.

---

## 3. Rollback Procedure — Web Service

### Option A: Railway redeploy previous version (fastest)

1. Railway → `hasan-chart-web` → **Deployments**
2. Find last successful deployment before the failed one
3. Click **Redeploy** on that deployment
4. Wait for healthcheck `/api/health` → 200
5. Verify:
   ```bash
   curl -sS https://www.hasanchartworld.com/api/health | jq '.status'
   ```

### Option B: Git revert + redeploy

1. Identify `ROLLBACK_COMMIT`
2. ```bash
   git checkout ROLLBACK_COMMIT
   # or: git revert <bad-commit-sha>
   ```
3. Push to deploy branch (triggers Railway rebuild)
4. Confirm `npm run build` passed in Railway build logs
5. Verify `/api/health` → 200

### Option C: Environment-only rollback

If failure is caused by a **bad env var change** (not code):

1. Railway → Web service → **Variables**
2. Restore previous values from backup/screenshot
3. **Redeploy** (env changes require restart)
4. Verify `/api/health`

**Do not rollback env vars that fix security issues unless the security change itself caused the outage.**

---

## 4. Rollback Procedure — Worker Service

Worker rollback is **independent** from Web. Price alerts depend on Worker — prioritize if alerts are broken.

1. Railway → `hasan-chart-worker` → **Deployments**
2. Redeploy last successful Worker deployment
3. Verify:
   ```bash
   curl -sS https://YOUR-WORKER.up.railway.app/health | jq '{status, webPushConfigured, alertsWorker}'
   ```
4. Check logs for `PRICE_ALERT_WORKER_STARTED` and `scheduler-started`
5. Confirm `checkIntervalMs` is expected (default 30000)

If Worker env vars changed:

1. Restore VAPID, Supabase, Resend keys from backup
2. Redeploy Worker
3. Test alert delivery with a staging alert

### Editor V2 instant rollback (no code revert)

RSS live authority returns to the legacy `b2625a7` path when V2 is not in `LIVE` mode.

1. Railway → news worker service → **Variables**
2. Set `EDITOR_V2_MODE=SHADOW` (observe only) or `EDITOR_V2_MODE=OFF` (disable V2 entirely)
3. Restart/redeploy the worker (or wait for the next process restart)
4. Verify `/health` shows `editorV2Mode: "SHADOW"` or `"OFF"`
5. Confirm live RSS publishes use the legacy editorial path; shadow metrics continue only in `SHADOW`

Do **not** set `EDITOR_V2_MODE=LIVE` unless explicitly authorized. No DB or migration rollback is required.

---

## 5. Database Rollback

**⚠️ Supabase migrations are generally NOT reversible in production.**

| Scenario | Action |
|----------|--------|
| Bad migration just applied | Restore from Supabase point-in-time backup (Pro plan) or manual SQL revert |
| Bad data from bug | Identify affected rows; run targeted DELETE/UPDATE with service role |
| Schema mismatch after code rollback | Ensure rolled-back code matches current schema, or revert migration too |

**Prevention:** Always apply migrations in staging first. Never run destructive migrations on launch day.

Supabase backup:

1. Supabase Dashboard → **Database** → **Backups**
2. Note latest backup timestamp before deploy
3. For recovery: restore to new project or use PITR if available

---

## 6. DNS / Domain Rollback

If custom domain was changed:

1. Restore previous DNS records at registrar
2. Wait for TTL propagation (up to 48h; usually < 1h)
3. Verify `NEXT_PUBLIC_SITE_URL` still matches active domain

---

## 7. Post-Rollback Verification

Complete within 15 minutes of rollback:

| Check | Command / Action | Expected |
|-------|------------------|----------|
| Web health | `GET /api/health` | 200, `status: ok` |
| Worker health | `GET /health` | `online`, `webPushConfigured: true` |
| Login | Manual test | Success |
| Alerts list | `GET /api/alerts` (authenticated) | 200 |
| Alert create | `/alerts?tab=create` | Success |
| Notifications | Bell icon | Loads without error |

---

## 8. Communication Template

**Internal (team):**

> Rollback executed at [TIME].
> Service: [Web / Worker / Both]
> Reason: [brief]
> Rolled back to commit: [SHA]
> Current status: [health check results]
> Next step: [root cause analysis / hotfix plan]

**External (users — only if user-facing outage > 15 min):**

> نعتذر عن الانقطاع المؤقت. تم استعادة الخدمة. فريق HasaN CharT World يتابع الاستقرار.

---

## 9. Root Cause Follow-Up

After rollback stabilizes:

1. Capture Railway build logs + runtime logs (web + worker)
2. Capture `/api/health` full JSON at time of failure
3. Identify whether failure was: code / env / migration / external (Supabase, Resend, OKX)
4. Fix in branch → `npm run build` → staging test → redeploy with updated `ROLLBACK_COMMIT`

---

## 10. Rollback Decision Matrix

| Failed component | Rollback Web | Rollback Worker | Rollback env only |
|------------------|:------------:|:---------------:|:-----------------:|
| Homepage 500 | ✅ | — | Maybe |
| API routes 500 | ✅ | — | Maybe |
| Alerts not firing | — | ✅ | Maybe |
| Push broken | — | ✅ | ✅ (VAPID) |
| Email broken | — | ✅ | ✅ (Resend) |
| Login broken | ✅ | — | ✅ (Turnstile) |
| DB connection | ✅ | ✅ | ✅ (Supabase keys) |

---

## 11. Disaster Recovery Baseline (Phase 13.1 — verified 2026-08-29)

Read-only audit baseline. **No secret values belong in this document.**

### 11.1 Production Git baseline

- Branch: `main`
- Commit: `0bfe4e732c728c4bbff1ea56a33f41408076fcdf`
- Working tree must be clean before any DR action.

### 11.2 Supabase Postgres (project `lzgs***jfqlm`)

| Field | Verified value |
|-------|----------------|
| Organization plan | **Pro** |
| Automatic backups | **Enabled** — daily **PHYSICAL** backups |
| Latest successful backup | **2026-08-28 20:55:11 UTC** |
| Retention observed | **7 days** (2026-08-22 through 2026-08-28) |
| PITR available | **Yes** (Pro add-on) |
| PITR enabled | **No** — daily physical backups present (PITR replaces daily backups when enabled) |
| Storage in DB backup | **No** — Storage objects are metadata-only in Postgres |

**List backups (read-only):**

```bash
supabase backups list --project-ref lzgsxdsumnteuwtjfqlm
```

**Restore database (owner-only, causes downtime):**

1. Supabase Dashboard → **Database** → **Backups** → select backup → Restore
   **OR** CLI: `supabase backups restore --project-ref lzgsxdsumnteuwtjfqlm -t <unix-epoch-seconds>`
2. Project is inaccessible during restore — plan downtime.
3. Custom Postgres role passwords may need reset after daily backup restore.
4. **Do not restore Storage objects via DB restore.**

### 11.3 Payment-proof Storage (`payment-proofs` bucket)

| Field | Verified value (2026-08-29) |
|-------|----------------------------|
| Objects | **23** |
| Total size | **~9.0 MiB** (9,422,046 bytes) |
| MIME types | 16× PNG, 7× JPEG |
| Path pattern | 3 segments: `{id}/{id}/{filename}` (private bucket) |
| DB rows with `payment_proof_path` | **22** |
| Dangling DB references | **0** |
| Unreferenced Storage objects | **1** — classified **B: abandoned upload artifact** (2026-08-26; no upload-session or admin reference; keep in backup) |
| Independent off-site backup | **PENDING** — Cloudflare R2 approved; owner setup required (see §12) |

**Restore manifest procedure (when backup exists):**

1. Verify manifest object count = Supabase object count.
2. Verify checksum per object (SHA-256 in manifest).
3. Upload to `payment-proofs` preserving **exact object keys**.
4. Re-run DB cross-check: dangling references must remain 0.
5. Admin proof viewer spot-check (3 random rows).

**Backup location:** document only in owner vault — never commit paths with credentials.

### 11.4 Critical secret recovery (names only)

Maintain an **encrypted owner vault** (1Password / Bitwarden / age-encrypted archive) independent of Railway.

| Secret | Class | If lost |
|--------|-------|---------|
| `ACCOUNT_DATA_ENCRYPTION_KEY` | **C — non-regenerable** | Encrypted account-management credentials unrecoverable |
| `IAM_SERVICE_SECRET_PEPPER` | **C — non-regenerable** | Machine-auth secrets invalid; re-provision workers |
| `VAPID_PRIVATE_KEY` (+ public pair) | **B — disruptive** | All push subscriptions invalid until users re-subscribe |
| `IAM_SUBSCRIPTION_MAINTENANCE_SECRET`, `IAM_CRON_SERVICE_SECRET` | **B** | Worker/cron auth fails until re-provisioned in DB + Railway |
| `CRON_SECRET`, `WORKER_API_SECRET` | **B** | Legacy cron/worker HTTP auth fails |
| `SUPABASE_SERVICE_ROLE_KEY` | **A — regenerable** | Regenerate in Supabase dashboard; update Railway |
| `TELEGRAM_*`, `RESEND_*`, `OPENAI_API_KEY`, `TRADING_ECONOMICS_*`, `TURNSTILE_SECRET_KEY`, `UPSTASH_*` | **A** | Regenerate at provider; update Railway |

**Never create `backup.env` or commit secrets to Git.**

### 11.5 DNS known-good (2026-08-29)

| Hostname | Type | Target | TTL | Role |
|----------|------|--------|-----|------|
| `hasanchartworld.com` | A | `216.198.79.1` | 1800 | Apex redirect edge |
| `www.hasanchartworld.com` | CNAME | `zm6r57mo.up.railway.app` | ~1589 | Canonical Railway web |
| NS | — | `dns1.registrar-servers.com`, `dns2.registrar-servers.com` | 1800 | Registrar DNS |

**Live routing verified:**

- `https://hasanchartworld.com/` → **308** → `https://www.hasanchartworld.com/`
- `https://www.hasanchartworld.com/` → **200**

Registrar: Namecheap (nameservers `registrar-servers.com`). Do not redesign apex/www routing during recovery — restore these records.

### 11.6 Emergency restore sequence

```
P0 detected
  → classify: code vs data vs Storage
  → if DB restore planned: STOP NEWS WORKER FIRST (prevent duplicate Telegram posts)
  → freeze admin subscription activations
  → note incident timestamp for backup/PITR target

Code issue
  → Railway redeploy last good deployment (Web / Worker independently)

DB issue
  → supabase backups list → pick backup BEFORE incident
  → restore via Dashboard or CLI (owner)
  → validate auth login + subscription_requests + profiles entitlements

Storage (payment proofs)
  → restore from off-site manifest (when available)
  → preserve exact object keys

Restart order
  1. Web (verify /api/health)
  2. Subscription cron / maintenance
  3. Price alerts worker
  4. Email queue + campaign crons
  5. VIP status delivery worker
  6. News worker LAST (after dedupe tables verified)

Post-restore checklist
  □ Auth login (test account)
  □ subscription_requests vs profiles entitlements aligned
  □ 3 admin payment-proof views load
  □ Worker /health online
  □ news_event_publications latest row sane vs Telegram
```

---

## 12. Off-Site Backup Architecture (Phase 13.2 — approved 2026-08-29)

**Primary destination:** Cloudflare R2 (private, S3-compatible).
**Status:** Owner setup **required** before first backup — no R2 credentials were available in the local environment during Phase 13.2 execution.

### 12.1 Owner setup steps (required before backup)

1. **Cloudflare Dashboard** → R2 → Create bucket (e.g. `hasanchartworld-dr`)
2. **Block all public access** on the bucket
3. Create **least-privilege API token** scoped to this bucket only (`Object Read & Write`)
4. Store credentials in owner encrypted vault — **never Git, never chat**
5. Provide credentials locally via environment (example names only):

   | Variable | Purpose |
   |----------|---------|
   | `DR_R2_BUCKET` | Bucket name |
   | `DR_R2_ENDPOINT` | S3 endpoint URL |
   | `DR_R2_ACCESS_KEY_ID` | R2 access key |
   | `DR_R2_SECRET_ACCESS_KEY` | R2 secret key |
   | `DR_R2_REGION` | `auto` |

6. Re-run Phase 13.2 Gates 3–5 (payment proofs) and 7–9 (database)

### 12.2 R2 backup layout (deterministic)

```
payment-proofs/
  YYYY-MM-DDTHH-MM-SSZ/
    objects/              ← exact Supabase object keys preserved
    manifest.json
    checksums.sha256

database/
  YYYY-MM-DD/
    schema-auth-public-storage.sql.gz   ← encrypted at rest before upload
    data-auth-public-storage.sql.gz
    manifest.json
    checksums.sha256
```

- No public URLs
- No mutation of Supabase source paths
- Manifests contain keys, sizes, MIME types, SHA-256 — no signed URLs

### 12.3 Payment-proof backup procedure (when R2 ready)

1. **COPY only** from Supabase `payment-proofs` (baseline: 23 objects / 9,422,046 bytes)
2. SHA-256 every object; 100% verification (not sampled)
3. Upload to R2 prefix with manifest
4. Read-only restore simulation to local scratch — verify checksums — delete scratch only
5. **Keep the 1 orphan object** in backup (do not delete from Supabase)

### 12.4 Independent database backup method

**Default `supabase db dump` is insufficient alone** — it dumps **public schema structure only** and excludes `auth` and `storage`.

**Approved two-pass logical backup** (read-only against production):

```bash
# Pass 1 — schema for business + auth + storage metadata
supabase db dump --linked -s auth,public,storage -f schema-auth-public-storage.sql

# Pass 2 — data for same schemas
supabase db dump --linked --data-only -s auth,public,storage -f data-auth-public-storage.sql
```

| Coverage | Included | Not included |
|----------|----------|--------------|
| `public` (102 tables) | ✅ schema + data | — |
| `auth` (23 tables) | ✅ schema + data (`auth.users`, sessions, identities) | `auth.schema_migrations` data |
| `storage` (8 tables) | ✅ schema + data (bucket/object **metadata**) | Object **bytes** (use §12.3) |
| Extensions (`extensions` schema) | ❌ | Must reinstall on new project |
| Custom role passwords | ❌ | Reset after restore |
| Vault/pgsodium keys | ❌ | Platform-managed |

**Security:** gzip + encrypt (age/GPG) before R2 upload; delete local temp files after verified upload; never commit dumps to Git.

**First independent DB backup:** PENDING (requires R2 credentials).

### 12.5 Recovery layers

| Layer | Source | Use case | RPO |
|-------|--------|----------|-----|
| 1 | Supabase daily physical backups | Ordinary DB restore | ≤ 24h |
| 2 | R2 logical DB snapshots (weekly minimum) | Total Supabase project loss | ≤ 7d |
| 3 | R2 payment-proof objects (daily incremental) | Storage bucket loss | ≤ 24h |

**PITR:** Not enabled. Remains optional if RPO < 24h becomes a business requirement.

### 12.6 Proposed cadence (enable after first manual backup succeeds)

| Asset | Cadence | Retention |
|-------|---------|-----------|
| Payment proofs | Daily incremental | 90 days minimum |
| Database logical | Weekly full snapshot | 90 days minimum |
| Verification | Checksum pass after every run | — |
| Alert | Owner notification on failure | — |

### 12.7 Owner secret vault (required for Phase 13 closure)

Store in 1Password / Bitwarden / encrypted archive — **NOT CONFIRMED BY OWNER** as of Phase 13.2:

- `ACCOUNT_DATA_ENCRYPTION_KEY` (Class C — non-regenerable)
- `IAM_SERVICE_SECRET_PEPPER` (Class C)
- VAPID key pair (Class B)
- `IAM_SUBSCRIPTION_MAINTENANCE_SECRET`, `IAM_CRON_SERVICE_*`
- `CRON_SECRET`, `WORKER_API_SECRET`
- R2 credentials (§12.1)
- Full Railway production secret inventory

### 12.8 Automation (Phase 13.3 — not deployed)

When authorized: dedicated Railway cron or local scheduled job with read-only Supabase access, write-only R2 scope, idempotent date prefixes, manifest + checksums, failure alerts, no deletion lifecycle in v1.

---

*Keep this document accessible to anyone with Railway deploy access.*

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

*Keep this document accessible to anyone with Railway deploy access.*

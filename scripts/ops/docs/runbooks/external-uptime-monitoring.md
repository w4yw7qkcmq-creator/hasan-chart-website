# External Uptime & Incident Alerting (Phase 14)

**Status: VERIFIED ACTIVE** — Phase 14 closed. Independent HTTP monitoring is live on UptimeRobot Free.

Railway internal health checks and in-project probes **do not** detect a full Railway platform outage. External monitors run on UptimeRobot infrastructure, outside Railway, Supabase Edge Functions, and application cron.

## Provider

| Field | Value |
|---|---|
| Provider | **UptimeRobot** |
| Plan | **Free** (50 monitors, 5-minute interval, email alerts, HTTPS, recovery notifications) |
| Active monitors | **3** (3 UP, 0 DOWN, 0 PAUSED at closure) |
| Dashboard uptime | **100%** at Phase 14 closure |

Do **not** store provider API tokens in this repository.

## External independence

Monitors originate on **UptimeRobot's infrastructure** — not:

- Another Railway service in this project
- Application cron inside Railway
- Supabase Edge Functions in the same dependency chain

This closes the previously accepted observability gap where a complete Railway outage could not reliably self-report.

---

## P0 — Website health (ACTIVE)

| Field | Value |
|---|---|
| URL | `https://www.hasanchartworld.com/api/health` |
| Method | GET |
| Auth | None |
| Interval | **5 minutes** |
| Timeout | 30 seconds |
| Alert after | 2 consecutive failures |
| Recovery alert | **Enabled** |
| Current state | **UP** |

**Pass criteria**

- HTTP 200
- JSON `status` = `ok`
- JSON `readiness` = `ready`

**What it proves:** App process + Supabase DB probe (via `database.status` / `checks.database`).

**Security:** Public endpoint; no secrets. Returns IAM flag summary and auth counters — acceptable for external polling. Do **not** use `?detail=1` (admin/cron auth required; richer diagnostics).

**Severity:** CRITICAL on failure.

---

## P0 — Homepage (ACTIVE)

| Field | Value |
|---|---|
| URL | `https://www.hasanchartworld.com/` |
| Method | GET |
| Auth | None |
| Interval | **5 minutes** |
| Pass criteria | HTTP 200, valid TLS |
| Current state | **UP** |

**Purpose:** Catch SSR/rendering/CDN failures when `/api/health` still returns 200.

**Severity:** CRITICAL on failure.

---

## P1 — Price Alerts Worker (ACTIVE)

| Field | Value |
|---|---|
| URL | `https://hasan-chart-worker-production.up.railway.app/health` |
| Auth | None (already public) |
| Interval | **5 minutes** |
| Pass criteria | HTTP 200, JSON `status` = `online`, `readiness` = true |
| Current state | **UP** |

**What it proves:** Worker process liveness + env validation; partial dependency signal.

**DB telemetry fallback:** `price_alert_worker_runs` — stale if last success &gt; ~8 minutes (30s cycle × 10 + grace). Admin: Price Alert Worker Status card.

**Severity:** HIGH on failure / stale.

---

## P1 — News Worker (intentional — no public HTTP monitor)

| Field | Value |
|---|---|
| Public `/health` | **Not exposed** — Railway `healthcheckPath = /health` only (internal) |
| External HTTP | **Intentionally deferred** — do not expose admin endpoints for monitoring |

**Coverage instead:**

- Railway service health check (internal)
- DB: `news_worker_cycle_runs`, `news_system_metric_snapshots` (`worker_heartbeat`)
- Admin (auth): `GET /api/admin/news/system-status`

**Stale guidance:** Investigate if no successful cycle row within ~2× poll interval + buffer (poll interval from worker env; typically minutes-scale).

**Severity:** HIGH when stale/down per admin read-model.

This is intentional architecture, not a Phase 14 blocker.

---

## P1 — Subscription maintenance (cron — no HTTP uptime)

| Field | Value |
|---|---|
| Cadence | Every **15 minutes** (`*/15 * * * *`) |
| Service | Railway cron — `railway.subscription-cron.toml` |
| Legacy HTTP API | `subscription-maintenance-api-production.up.railway.app` — **404 / suspended** (do not resurrect) |

**Coverage:**

- Railway cron job success/failure logs
- Log events: `subscription_maintenance_cron_call_success` / `_failed`
- **Stale threshold: 30 minutes** (two missed expected runs)
- Slow run warning threshold: **120 seconds**

**Severity:** HIGH when stale.

---

## P2 — Email queue worker

| Field | Value |
|---|---|
| HTTP health | **None** |
| Mode | Persistent loop or oneshot cron |

**Coverage:** Admin email analytics / outbox queue depth; Railway logs (`EMAIL_QUEUE_*` events).

**Severity:** MEDIUM on sustained backlog or worker stopped.

---

## P2 — Email campaign processor

| Field | Value |
|---|---|
| Cadence | Every 5 minutes when active (`*/5 * * * *`) |
| HTTP health | **None** — invokes `POST /api/cron/process-email-campaigns` with secret |

**Coverage:** Railway cron logs; campaign admin metrics.

**Severity:** MEDIUM when cron fails repeatedly during active campaigns.

---

## P2 — Profiles last-sign-in reconcile

| Field | Value |
|---|---|
| Cadence | Daily at 03:00 UTC (`0 3 * * *`) |
| HTTP health | **None** |

**Coverage:** Railway cron logs; `PROFILES_LAST_SIGN_IN_RECONCILE_SUCCESS` / `_FAILED`.

**Stale threshold:** &gt; 26 hours without success log.

**Severity:** MEDIUM.

---

## P2 — VIP status delivery worker

| Field | Value |
|---|---|
| HTTP health | **None** |

**Coverage:** Railway logs and restart policy; admin delivery views if available.

**Severity:** MEDIUM.

---

## Alert destination

| Channel | Status |
|---|---|
| Owner email | **VERIFIED** — configured in UptimeRobot account |
| Test notification | **VERIFIED** — owner confirmed receipt at Phase 14 closure |
| Recovery notifications | **Enabled** (UptimeRobot default for email alerts) |
| Telegram (private admin) | Not configured |

Do not simulate production outages for testing.

---

## False-positive control

- Interval: **5 minutes** (active on all three monitors)
- Confirm: **2 consecutive failures** before page (UptimeRobot default)
- Timeout: **30s**
- Recovery notifications: **enabled**
- Maintenance windows: pause monitors during planned deploys if needed

---

## Owner recovery checklist

1. Confirm alert via UptimeRobot dashboard (not a false positive).
2. Check `https://www.hasanchartworld.com/api/health` manually.
3. Railway dashboard → web + affected worker services.
4. Follow [health-down.md](./health-down.md) (P0) or [worker-down.md](./worker-down.md) (workers).
5. Re-run `npm run smoke:production` and `npm run ops:generate` after recovery.

---

## Phase 14 closure checklist

- [x] UptimeRobot Free account with owner email verified
- [x] P0 monitor on `/api/health` with body checks (`status=ok`, `readiness=ready`)
- [x] P0 homepage monitor on `/`
- [x] P1 Price Alerts Worker monitor on public `/health`
- [x] Recovery alerts enabled
- [x] Test notification sent and confirmed received
- [x] News Worker — internal telemetry documented (no public endpoint)
- [x] Subscription maintenance — 15-minute cron + 30-minute stale threshold documented
- [x] No new public exposure of admin/private endpoints
- [x] No monitoring API tokens committed to repository

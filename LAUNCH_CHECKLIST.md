# HasaN CharT World — Final Launch Checklist

**Go / No-Go** checklist for official production launch. Complete every item in order.

---

## Phase 1 — Code Ready (T-24h)

| # | Item | Owner | Done |
|---|------|-------|------|
| 1 | `npm run build` passes | Dev | ☐ |
| 2 | `PREFLIGHT_STRICT=1 npm run check` passes on deploy environment | Dev | ☐ |
| 3 | All Supabase migrations applied (28 files in `supabase/migrations/`) | Dev | ☐ |
| 4 | Deploy from stable git commit (tag recommended) | Dev | ☐ |
| 5 | Rollback commit identified (see `ROLLBACK_PLAN.md`) | Dev | ☐ |

---

## Phase 2 — Infrastructure (T-12h)

### Railway Web

| # | Item | Done |
|---|------|------|
| 6 | Web service deployed with `npm run build && npm run start` | ☐ |
| 7 | Custom domain `www.hasanchartworld.com` active + HTTPS | ☐ |
| 8 | Healthcheck `/api/health` → 200 | ☐ |
| 9 | All **required** Web env vars set (see `PRODUCTION_CHECKLIST.md` §B2) | ☐ |

### Railway Worker

| # | Item | Done |
|---|------|------|
| 10 | Worker service deployed with `npm run start:worker` | ☐ |
| 11 | Healthcheck `/health` → `{ "success": true, "status": "online" }` | ☐ |
| 12 | `webPushConfigured: true` in worker health response | ☐ |
| 13 | Worker logs: `PRICE_ALERT_WORKER_STARTED` + `scheduler-started` | ☐ |
| 14 | All **required** Worker env vars set (see `PRODUCTION_CHECKLIST.md` §C2) | ☐ |

### Supabase

| # | Item | Done |
|---|------|------|
| 15 | Production project URL + keys match Railway vars | ☐ |
| 16 | Auth redirect URLs include production domain | ☐ |
| 17 | `price_alerts`, `push_subscriptions`, `user_notifications` tables exist | ☐ |

### Third-party

| # | Item | Done |
|---|------|------|
| 18 | Resend domain verified + `RESEND_API_KEY` active | ☐ |
| 19 | Resend webhook configured with `RESEND_WEBHOOK_SECRET` | ☐ |
| 20 | Cloudflare Turnstile keys active for production domain | ☐ |
| 21 | VAPID keys generated and set on Web + Worker | ☐ |
| 22 | Upstash Redis connected (rate limits) | ☐ |

---

## Phase 3 — Functional Smoke Tests (T-2h)

| # | Flow | Done |
|---|------|------|
| 23 | Register new account (Turnstile) | ☐ |
| 24 | Login / logout / session refresh | ☐ |
| 25 | Create price alert → appears in `/alerts` and `/my-dashboard` | ☐ |
| 26 | Edit + delete price alert | ☐ |
| 27 | Site notification bell shows unread count | ☐ |
| 28 | Web Push subscription (if browser supports) | ☐ |
| 29 | Price alert triggers → site notification + push + email | ☐ |
| 30 | Submit analysis request at `/analysis/request` | ☐ |
| 31 | Partner center loads for partner user | ☐ |
| 32 | VIP spot page shows signals | ☐ |
| 33 | Admin dashboard loads for admin user | ☐ |
| 34 | News page loads articles | ☐ |
| 35 | `/api/health` all checks `ok` or acceptable `degraded` | ☐ |

---

## Phase 4 — Launch (T-0)

| # | Action | Done |
|---|--------|------|
| 36 | DNS fully propagated | ☐ |
| 37 | Announce / enable traffic | ☐ |
| 38 | Monitor `/api/health` for 30 minutes | ☐ |
| 39 | Monitor Worker `/health` for 30 minutes | ☐ |
| 40 | Monitor Railway logs for errors | ☐ |
| 41 | Monitor Resend delivery dashboard | ☐ |

---

## Phase 5 — Post-Launch (T+24h)

| # | Action | Done |
|---|--------|------|
| 42 | Review error logs (web + worker) | ☐ |
| 43 | Confirm price alerts firing correctly | ☐ |
| 44 | Confirm no 503 on `/api/health` | ☐ |
| 45 | Backup/confirm rollback commit still deployable | ☐ |

---

## Go / No-Go Decision

| Criteria | Required |
|----------|----------|
| Build passes | **Yes** |
| Strict preflight passes on production env | **Yes** |
| Web `/api/health` → 200 | **Yes** |
| Worker `/health` → online + `webPushConfigured: true` | **Yes** |
| Auth flow works | **Yes** |
| Price alert create/edit/delete works | **Yes** |
| At least one delivery channel tested (site notification minimum) | **Yes** |

**Launch approved when all Phase 1–3 blockers are checked.**

---

*See also: `PRODUCTION_CHECKLIST.md`, `ROLLBACK_PLAN.md`, `DEPLOYMENT.md`*

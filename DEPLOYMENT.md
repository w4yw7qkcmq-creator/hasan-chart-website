# HasaN CharT World — Deployment Guide

Production deployment uses **two (or three) separate processes**:

| Service | Role | Start command |
|---------|------|---------------|
| **Web** | Next.js 14 app (UI + API routes) | `npm run build` → `npm run start` |
| **Worker (alerts)** | Price alerts, push, email, site notifications | `npm run start:worker` |
| **Worker (news)** *(optional)* | RSS/news ingestion, Telegram | `npm run start:worker:news` |

Copy `.env.example` to `.env.local` for local dev. **Never commit real secrets.**

---

## Related launch documents

| Document | Purpose |
|----------|---------|
| **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)** | Full verification: env, APIs, pages, Worker, Supabase |
| **[LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md)** | Final Go/No-Go checklist (T-24h → T+24h) |
| **[ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)** | Rollback procedure if deploy fails |
| **[.env.example](./.env.example)** | All environment variable names |

---

## 0. Pre-launch checks (before every deploy)

```bash
npm run build
npm run check
PREFLIGHT_STRICT=1 npm run check   # production gate — must pass
```

| Command | Purpose |
|---------|---------|
| `npm run build` | Production compile — must pass (115 routes) |
| `npm run check` | Preflight: required files, env names, SITE_URL, secret scan |
| `PREFLIGHT_STRICT=1 npm run check` | Fail on missing production env vars |
| `npm run security:audit` | Optional deeper static security review |

After deploy:

1. `GET https://www.hasanchartworld.com/api/health` → expect 200 (`ok` or `degraded`)
2. Worker `GET /health` → expect `{ "success": true, "status": "online", "webPushConfigured": true }`

Preflight reads `.env.local` / `.env` if present but **never prints secret values**.

---

## 1. Prerequisites

- [Supabase](https://supabase.com) project with all migrations applied (`supabase/migrations/` — 28 files)
- [Resend](https://resend.com) domain verified + API key
- [Upstash Redis](https://upstash.com) *(recommended for rate limits across replicas)*
- [Cloudflare Turnstile](https://dash.cloudflare.com) site + secret keys
- VAPID keys for Web Push (`npx web-push generate-vapid-keys`)
- [Railway](https://railway.app) account (or similar Node.js host)

---

## 2. Railway — Web Service (Next.js)

### Create service

1. New Project → **Deploy from GitHub repo**
2. Service name: `hasan-chart-web`
3. **Root directory:** repository root
4. **Build command:** `npm install && npm run build`
5. **Start command:** `npm run start`
6. **Healthcheck path:** `/api/health`
7. **Healthcheck timeout:** 30s (market stream probe may take up to ~9s)

### Required variables (Web service)

| Variable | Required | Notes |
|----------|:--------:|-------|
| `NODE_ENV` | ✅ | `production` |
| `NEXT_PUBLIC_SITE_URL` | ✅ | `https://www.hasanchartworld.com` |
| `SITE_URL` | ✅ | Same as above (server fallback) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server only — never `NEXT_PUBLIC_*` |
| `RESEND_API_KEY` | ✅ | Email sending |
| `TURNSTILE_SECRET_KEY` | ✅ | Server-side Turnstile verify |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ✅ | Client widget |
| `CRON_SECRET` | ✅ | Cron route protection |
| `ACCOUNT_DATA_ENCRYPTION_KEY` | ✅ | 32+ characters |
| `VAPID_PUBLIC_KEY` | ✅ | Push (server) |
| `VAPID_PRIVATE_KEY` | ✅ | Push signing |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ⭐ | Browser push subscription |
| `VAPID_SUBJECT` | ⭐ | `mailto:alerts@hasanchartworld.com` |
| `UPSTASH_REDIS_REST_URL` | ⭐ | Multi-instance rate limits |
| `UPSTASH_REDIS_REST_TOKEN` | ⭐ | Redis auth |
| `RESEND_WEBHOOK_SECRET` | ⭐ | Email analytics webhooks |
| `EMAIL_FROM` | ⭐ | Verified sender |
| `EMAIL_REPLY_TO` | ⭐ | Support reply address |
| `ADMIN_EMAIL` | ⭐ | Admin notifications |
| `NEXT_PUBLIC_RAILWAY_AI_WORKER_URL` | ○ | Dashboard AI feature |
| `WORKER_API_SECRET` | ○ | Worker API auth (falls back to `CRON_SECRET`) |

✅ = launch blocker · ⭐ = strongly recommended · ○ = feature-specific

Railway auto-injects `PORT` and `RAILWAY_GIT_COMMIT_SHA` (surfaced in `/api/health` build meta).

### Custom domain

1. Railway → Web service → Settings → Networking → Custom Domain
2. Point DNS to Railway
3. Ensure `NEXT_PUBLIC_SITE_URL` and `SITE_URL` match the canonical domain

### Resend webhook

- **URL:** `https://www.hasanchartworld.com/api/webhooks/resend`
- **Secret:** same value as `RESEND_WEBHOOK_SECRET`
- Production rejects webhooks without configured secret (503)

---

## 3. Railway — Worker Service (Price Alerts)

> **Critical:** Price alerts run **only** on the Worker. Website `/api/check-price-alerts` returns **410** by design.

### Delivery architecture

```
Worker setInterval (every 30s)
  → checkPriceAlerts()
    → deliverRealPriceAlert()
      1. Site Notification  (create-user-notification.js → user_notifications)
      2. Web Push           (push-sender.js → push_subscriptions)
      3. Email              (price-alert-email.js → Resend)
```

No legacy paths: Supabase Edge Functions and website cron are disabled.

### Create service

1. Same Railway project → **New Service** from same repo
2. Service name: `hasan-chart-worker`
3. **Build command:** `npm install`
4. **Start command:** `npm run start:worker`
5. **Healthcheck path:** `/health`

### Required variables (Worker)

| Variable | Required | Notes |
|----------|:--------:|-------|
| `NODE_ENV` | ✅ | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Same project as Web |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role |
| `RESEND_API_KEY` | ✅ | Alert emails |
| `VAPID_PUBLIC_KEY` or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ | At least one |
| `VAPID_PRIVATE_KEY` | ✅ | Push signing |
| `VAPID_SUBJECT` | ✅ | VAPID identity |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Email CTA links |
| `PRICE_ALERT_CHECK_INTERVAL_MS` | ○ | Default `30000` |
| `OPENAI_API_KEY` | ○ | `/api/instant-analysis` |
| `WORKER_API_SECRET` | ○ | Falls back to `CRON_SECRET` |
| `PORT` | auto | Set by Railway |

### Worker health response

```json
{
  "success": true,
  "status": "online",
  "service": "hasan-chart-worker",
  "alertsWorker": true,
  "webPushConfigured": true,
  "checkIntervalMs": 30000,
  "priceAlertSinglePath": "worker/index.js::deliverRealPriceAlert"
}
```

**Launch blocker:** `webPushConfigured` must be `true`.

---

## 4. Railway — Worker Service (News) *(optional)*

1. New Service → same repo
2. **Start command:** `npm run start:worker:news`
3. No HTTP health endpoint — monitor via logs

### Additional variables

- `SUPABASE_URL` *(= `NEXT_PUBLIC_SUPABASE_URL`)*
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`
- `OPENAI_API_KEY`
- `TRADING_ECONOMICS_API_KEY` or `TRADING_ECONOMICS_CLIENT`

---

## 5. Supabase Setup

### Apply migrations

```bash
# Via Supabase CLI (recommended)
supabase db push

# Or: paste each file from supabase/migrations/ into SQL Editor
```

Apply **all 28 migration files** before first production deploy.

### Critical tables

| Table | Service |
|-------|---------|
| `price_alerts` | Alerts API + Worker |
| `push_subscriptions` | Web + Worker push |
| `user_notifications` | Site notifications |
| `user_notification_settings` | Delivery preferences |
| `profiles` | Auth, roles, subscriptions |
| `analysis_requests` | Analysis feature |
| `partner_*` | Partner program |
| `vip_signals` | VIP spot/futures |

### Supabase Auth settings

- Add production URL to **Redirect URLs**
- Confirm email templates (if using Supabase auth emails)
- Verify RLS policies on user tables

### Edge Functions (legacy — do not enable)

These return disabled responses. Worker is the canonical path:

- `check-price-alerts`
- `send-price-alert`
- `send-price-alert-email`
- `price-alert-email`

---

## 6. Commands reference

```bash
# Local development
cp .env.example .env.local
npm install
npm run dev

# Production build (web)
npm run build
npm run start

# Workers (from repo root)
npm run start:worker          # price alerts + push + email + site notifications
npm run start:worker:news     # news ingestion

# Pre-launch
npm run build && npm run check
PREFLIGHT_STRICT=1 npm run check
```

---

## 7. Health check URLs

| Service | URL | Expected |
|---------|-----|----------|
| Web | `GET /api/health` | 200 (`ok`/`degraded`) or 503 (`down`) |
| Worker | `GET /health` | 200 `{ success: true, status: "online" }` |

### Web health response (summary)

```json
{
  "success": true,
  "service": "hasan-chart-website",
  "status": "ok",
  "checks": {
    "app": { "status": "ok" },
    "database": { "status": "ok" },
    "redis": { "status": "ok" },
    "marketStream": { "status": "ok" },
    "memory": { "status": "ok" }
  }
}
```

Use Railway health checks or external monitor (Better Uptime, Checkly) on both endpoints.

---

## 8. Future deployment workflow

### Standard deploy (no schema changes)

1. Merge PR to `main`
2. Record current production commit as rollback point (see `ROLLBACK_PLAN.md`)
3. `npm run build` + `PREFLIGHT_STRICT=1 npm run check` locally or in CI
4. Railway auto-deploys Web + Worker from `main`
5. Verify `/api/health` and Worker `/health`
6. Run smoke tests from `LAUNCH_CHECKLIST.md` Phase 3
7. Monitor logs for 30 minutes

### Deploy with Supabase migrations

1. Apply migrations to **staging** Supabase first
2. Test affected features in staging
3. Apply migrations to **production** Supabase
4. Deploy Web + Worker code that depends on new schema
5. Verify health + affected features

### Hotfix deploy

1. Branch from `main` → fix → `npm run build`
2. Merge to `main` (fast-track review)
3. Railway redeploy
4. If fix fails → execute `ROLLBACK_PLAN.md` immediately

### Environment variable change

1. Update variable in Railway (Web or Worker)
2. **Redeploy** service (restart required)
3. Verify health endpoint
4. Test affected feature (e.g. VAPID change → test push)

---

## 9. Production API quick-test commands

```bash
# Public
curl -sS https://www.hasanchartworld.com/api/health
curl -sS https://www.hasanchartworld.com/api/market-pulse

# Cron (must include secret)
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://www.hasanchartworld.com/api/check-subscription-expiry

# Price alerts cron (expect 410 — Worker handles this)
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://www.hasanchartworld.com/api/check-price-alerts

# Worker
curl -sS https://YOUR-WORKER.up.railway.app/health
```

Authenticated APIs (alerts, my-analysis, partner) require session cookies — test via browser while logged in.

---

## 10. Critical pages — route map

| Common name | Production URL | Auth |
|-------------|----------------|------|
| Homepage | `/` | No |
| Prices / Markets | `/markets`, `/btc`, `/eth`, … | No |
| News | `/news` | No |
| Analysis request | `/analysis/request` | Yes (submit) |
| Daily analysis | `/daily-analysis` | No |
| Price alerts app | `/alerts` | Yes (create/edit) |
| Partner center | `/partner-center` | Yes |
| VIP Spot | `/vip-spot` | No |
| Trading academy | `/trading-academy` | No |
| Admin | `/admin` | Admin role |
| User dashboard | `/my-dashboard` | Yes |

> Note: `/prices`, `/analysis`, and `/academy` are not standalone routes. Use the URLs above.

---

## 11. Production safety checklist

- [ ] `npm run build` passes
- [ ] `PREFLIGHT_STRICT=1 npm run check` passes
- [ ] All Supabase migrations applied
- [ ] `NODE_ENV=production` on all Railway services
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only on server/worker
- [ ] `RESEND_WEBHOOK_SECRET` configured
- [ ] `CRON_SECRET` set
- [ ] `ACCOUNT_DATA_ENCRYPTION_KEY` set (32+ chars)
- [ ] VAPID keys on Web + Worker
- [ ] Upstash Redis configured
- [ ] Custom domain + `NEXT_PUBLIC_SITE_URL` aligned
- [ ] Worker `/health` → `webPushConfigured: true`
- [ ] Rollback commit recorded (`ROLLBACK_PLAN.md`)
- [ ] `LAUNCH_CHECKLIST.md` Phase 1–3 complete

---

## 12. Troubleshooting

| Symptom | Check |
|---------|-------|
| `/api/health` → 503 `database: down` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Rate limits ineffective | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Push notifications fail | VAPID keys on web + worker; `webPushConfigured` in `/health` |
| Price alerts not firing | Worker running; check Worker logs; NOT web cron route |
| Turnstile login fails | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` |
| Resend webhooks 503 | `RESEND_WEBHOOK_SECRET` missing |
| Alert emails not sent | `RESEND_API_KEY` on Worker; Resend domain verified |
| Site notifications missing | `user_notifications` table; Worker `create-user-notification.js` logs |
| AI analysis in dashboard fails | `NEXT_PUBLIC_RAILWAY_AI_WORKER_URL` + Worker `OPENAI_API_KEY` |

Logs are JSON-structured with automatic redaction (`lib/log-redaction.js`, `worker/log-redaction.js`).

---

## 13. Post-launch monitoring

| Monitor | URL / Tool | Frequency |
|---------|------------|-----------|
| Web uptime | `/api/health` | 1 min |
| Worker uptime | `/health` | 1 min |
| Error rate | Railway logs | Continuous |
| Email delivery | Resend dashboard | Daily |
| DB connections | Supabase dashboard | Daily |
| Price alert delivery | Worker logs `deliverRealPriceAlert` | On alert |

---

*Last updated: Phase 10 — Production Launch Preparation*

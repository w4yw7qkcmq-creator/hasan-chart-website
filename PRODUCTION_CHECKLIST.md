# HasaN CharT World — Production Checklist

Complete pre-launch verification for the **Web** (Next.js), **Worker** (price alerts), **Supabase**, and **Railway** services.

> **No new features.** This document is verification-only. Run before every production deploy.

---

## A. Build & Static Checks

| # | Check | Command / Action | Pass criteria |
|---|-------|------------------|---------------|
| A1 | Production build | `npm run build` | Exit code 0, 115 routes compiled |
| A2 | Preflight | `npm run check` | No errors (warnings acceptable locally) |
| A3 | Strict env gate | `PREFLIGHT_STRICT=1 npm run check` | Zero errors on Railway/CI before deploy |
| A4 | Security audit *(optional)* | `npm run security:audit` | Review output manually |
| A5 | Git state | `git status` | No uncommitted secrets; deploy from tagged commit |

---

## B. Railway — Web Service (`hasan-chart-web`)

### B1. Service configuration

- [ ] Build: `npm install && npm run build`
- [ ] Start: `npm run start`
- [ ] Healthcheck path: `/api/health`
- [ ] Healthcheck timeout: **30s** (market stream probe)
- [ ] `NODE_ENV=production`
- [ ] Custom domain: `https://www.hasanchartworld.com`
- [ ] `NEXT_PUBLIC_SITE_URL` matches canonical domain

### B2. Required environment variables (Web)

| Variable | Purpose | Blocker if missing |
|----------|---------|-------------------|
| `NEXT_PUBLIC_SITE_URL` | SEO, links, metadata | Yes |
| `SITE_URL` | Server-side canonical URL | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server DB | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client auth | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server APIs | Yes |
| `RESEND_API_KEY` | Transactional email | Yes |
| `TURNSTILE_SECRET_KEY` | Login/register bot protection | Yes |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile widget | Yes |
| `CRON_SECRET` | Protected cron routes | Yes |
| `ACCOUNT_DATA_ENCRYPTION_KEY` | Account-management credentials (32+ chars) | Yes |
| `VAPID_PUBLIC_KEY` | Web Push (server) | Yes |
| `VAPID_PRIVATE_KEY` | Web Push signing | Yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser push subscription | Recommended |
| `VAPID_SUBJECT` | VAPID mailto/contact | Recommended |
| `UPSTASH_REDIS_REST_URL` | Cross-instance rate limits | Recommended |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth | Recommended |
| `RESEND_WEBHOOK_SECRET` | Email analytics webhooks | Recommended |
| `EMAIL_FROM` | Sender address | Recommended |
| `EMAIL_REPLY_TO` | Reply-to header | Recommended |
| `ADMIN_EMAIL` | Admin notifications | Recommended |
| `NEXT_PUBLIC_RAILWAY_AI_WORKER_URL` | Dashboard AI instant analysis | Feature-only |
| `WORKER_API_SECRET` | Worker API auth (falls back to CRON_SECRET) | Optional |

### B3. Web health verification

```bash
curl -sS https://www.hasanchartworld.com/api/health | jq .
```

| Field | Expected |
|-------|----------|
| `success` | `true` |
| `status` | `ok` or `degraded` (not `down`) |
| `checks.database` | `ok` |
| `checks.redis` | `ok` or `skipped` |
| `checks.marketStream` | `ok` or `degraded` |

**503 = do not launch** until database connectivity is restored.

---

## C. Railway — Worker Service (`hasan-chart-worker`)

Price alerts **must** run here. Website route `/api/check-price-alerts` returns **410** by design.

### C1. Service configuration

- [ ] Start: `npm run start:worker` (or `cd worker && npm start`)
- [ ] Healthcheck path: `/health`
- [ ] `PRICE_ALERT_CHECK_INTERVAL_MS=30000` *(optional, default 30s)*
- [ ] Internal cron: `setInterval(checkPriceAlerts)` — **no external cron needed**

### C2. Required environment variables (Worker)

| Variable | Purpose | Blocker if missing |
|----------|---------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Read/write alerts, notifications, push subs | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role access | Yes |
| `RESEND_API_KEY` | Price alert emails | Yes |
| `VAPID_PUBLIC_KEY` or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push | Yes |
| `VAPID_PRIVATE_KEY` | Push signing | Yes |
| `VAPID_SUBJECT` | Push identity | Yes |
| `NEXT_PUBLIC_SITE_URL` | Email CTA links | Yes |
| `OPENAI_API_KEY` | `/api/instant-analysis` on worker | Feature-only |
| `WORKER_API_SECRET` or `CRON_SECRET` | Instant-analysis API auth | Recommended |
| `PORT` | Auto-set by Railway | Auto |

### C3. Worker health verification

```bash
curl -sS https://YOUR-WORKER.up.railway.app/health | jq .
```

| Field | Expected |
|-------|----------|
| `success` | `true` |
| `status` | `"online"` |
| `alertsWorker` | `true` |
| `webPushConfigured` | `true` |
| `priceAlertSinglePath` | `worker/index.js::deliverRealPriceAlert` |
| `checkIntervalMs` | `30000` (or configured value) |

### C4. Worker delivery channels

Verify all three channels use **one path only**:

```
worker/index.js → deliverRealPriceAlert
  1. Site Notification  → create-user-notification.js
  2. Web Push           → push-sender.js
  3. Email              → price-alert-email.js (Resend)
```

- [ ] No dependency on `/api/check-price-alerts` (returns 410)
- [ ] No dependency on Supabase Edge Functions (all marked legacy-disabled)
- [ ] Worker logs show `PRICE_ALERT_WORKER_STARTED` on boot
- [ ] Worker logs show `scheduler-started` with `intervalMs`

### C5. End-to-end alert test (staging or prod)

1. Create alert at `/alerts?tab=create` while logged in
2. Wait for OKX price to cross target (or use test alert in staging)
3. Confirm:
   - [ ] Row in `price_alerts` → `status = triggered`
   - [ ] Row in `user_notifications` (site notification)
   - [ ] Push received (if subscribed)
   - [ ] Email received via Resend

---

## D. Supabase

### D1. Migrations

Apply all files in `supabase/migrations/` before first production deploy.

Critical tables for launch:

| Table | Used by |
|-------|---------|
| `price_alerts` | Alerts API + Worker |
| `push_subscriptions` | Web Push |
| `user_notifications` | Site notifications |
| `profiles` | Auth, partner, subscriptions |
| `user_notification_settings` | Delivery preferences |
| `analysis_requests` | My analysis |
| `partner_*` tables | Partner center |
| `vip_signals` | VIP spot/futures |

### D2. Supabase dashboard checks

- [ ] Project URL matches `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Anon key matches `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Service role key set only on server/worker (never `NEXT_PUBLIC_*`)
- [ ] RLS policies enabled on user-facing tables
- [ ] Auth → URL configuration includes production domain
- [ ] Storage buckets configured (if analysis images used)
- [ ] Edge Functions `check-price-alerts`, `send-price-alert*` are **disabled/legacy** — Worker is canonical

### D3. Supabase environment mapping

| Supabase setting | Env variable |
|------------------|--------------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Anon public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Service role key | `SUPABASE_SERVICE_ROLE_KEY` |
| News worker alias | `SUPABASE_URL` (= same project URL) |

---

## E. Resend & Webhooks

- [ ] Domain verified in Resend
- [ ] `EMAIL_FROM` uses verified domain
- [ ] Webhook URL: `https://www.hasanchartworld.com/api/webhooks/resend`
- [ ] `RESEND_WEBHOOK_SECRET` matches Resend dashboard
- [ ] Production rejects unsigned webhooks (503 without secret)

---

## F. Production API Inventory

### F1. Public / unauthenticated

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/health` | GET | 200 |
| `/api/market-stream` | GET | 200 (SSE/stream) |
| `/api/market-pulse` | GET | 200 |
| `/api/auth/login` | POST | 200/401 |
| `/api/auth/register` | POST | 200/400 |
| `/api/auth/session` | GET | 200 |
| `/api/verify-turnstile` | POST | 200 |
| `/api/vip-signals` | GET | 200 |
| `/api/daily-analysis` | GET | 200 |
| `/api/partner/track-visit` | POST | 200 |
| `/api/partner/capture-ref` | POST | 200 |
| `/api/partner/leaderboard` | GET | 200 |

### F2. Authenticated user APIs

| Endpoint | Method | Test |
|----------|--------|------|
| `/api/alerts` | GET, POST | List + create while logged in |
| `/api/alerts/[id]` | PATCH, DELETE | Edit + delete active alert |
| `/api/my-analysis` | GET, POST | Load + submit request |
| `/api/my-notifications` | GET | Returns notifications |
| `/api/notification-settings` | GET, PUT | Load + save preferences |
| `/api/notification-sound-settings` | GET, PUT | Sound prefs |
| `/api/push/subscribe` | POST | Subscribe to push |
| `/api/push/unsubscribe` | POST | Unsubscribe |
| `/api/my-subscription-status` | GET | Subscription info |
| `/api/partner/center` | GET | Partner dashboard data |
| `/api/partner/wallet` | GET | Wallet balance |
| `/api/account-management` | GET, POST | Encrypted credentials |

### F3. Admin APIs (admin role required)

| Endpoint | Purpose |
|----------|---------|
| `/api/admin/dashboard` | Admin stats |
| `/api/admin/partners/*` | Partner management |
| `/api/admin/email-analytics/*` | Email tracking |
| `/api/admin/notification-test` | Test notifications |

### F4. Cron-protected APIs

| Endpoint | Auth | Expected |
|----------|------|----------|
| `/api/check-subscription-expiry` | `CRON_SECRET` header | 200 with secret |
| `/api/check-price-alerts` | `CRON_SECRET` | **410** (disabled — Worker handles alerts) |

### F5. Webhooks

| Endpoint | Provider |
|----------|----------|
| `/api/webhooks/resend` | Resend email events |

---

## G. Critical Pages

| Requested path | Actual route | Build status | Notes |
|----------------|--------------|--------------|-------|
| `/` | `/` | ✅ | Homepage |
| prices | `/markets`, `/btc`, `/assets` | ✅ | No `/prices` route — use `/markets` |
| `/news` | `/news` | ✅ | News listing |
| analysis | `/analysis/request`, `/daily-analysis` | ✅ | No `/analysis` root |
| `/alerts` | `/alerts` | ✅ | Auth required for create |
| `/partner-center` | `/partner-center` | ✅ | Auth for full features |
| `/vip-spot` | `/vip-spot` | ✅ | VIP signals |
| academy | `/trading-academy` | ✅ | No `/academy` route |
| `/admin` | `/admin` | ✅ | Admin role required |

### Page smoke tests (manual)

- [ ] `/` — loads, market data, navigation links work
- [ ] `/markets` — coin links resolve (e.g. `/btc`)
- [ ] `/news` — article list loads
- [ ] `/news/[id]` — article detail loads
- [ ] `/analysis/request` — form submits (logged in)
- [ ] `/daily-analysis` — content loads
- [ ] `/alerts` — list, create, edit, delete
- [ ] `/partner-center` — partner stats (logged in)
- [ ] `/vip-spot` — signals display
- [ ] `/trading-academy` — content loads
- [ ] `/admin` — dashboard (admin only)
- [ ] `/login` — Turnstile + auth flow
- [ ] `/my-dashboard` — alerts from DB (not localStorage)

---

## H. Site Links & SEO

- [ ] `GET /sitemap.xml` — returns valid XML
- [ ] `GET /robots.txt` — blocks `/admin`, `/api/`, `/my-dashboard`
- [ ] All `PUBLIC_SITEMAP_PATHS` in `lib/seo.js` return 200
- [ ] Internal nav links use `/alerts` not `/#alerts`
- [ ] Partner referral links `/r/[code]` resolve
- [ ] No broken links in footer/header (manual click-through)
- [ ] `themeColor` via `viewport` export (no build warnings)

---

## I. Security Final Checks

- [ ] `SUPABASE_SERVICE_ROLE_KEY` never in client bundle
- [ ] `CRON_SECRET` never exposed to browser
- [ ] CSP headers active in production (`lib/security-headers.js`)
- [ ] Rate limiting active (Upstash recommended)
- [ ] Error boundaries: `app/error.js`, `app/global-error.js`, `app/not-found.js`
- [ ] `/api/check-price-alerts` returns 410 (Worker-only policy)

---

## J. Monitoring (post-launch)

- [ ] External uptime on `/api/health` (web)
- [ ] External uptime on Worker `/health`
- [ ] Railway log alerts for 5xx spikes
- [ ] Resend dashboard for bounce/complaint rates
- [ ] Supabase dashboard for connection errors

---

*Last updated: Phase 10 — Production Launch Preparation*

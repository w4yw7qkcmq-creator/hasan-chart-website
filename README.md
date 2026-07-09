# HasaN CharT World

Next.js 14 platform for financial market analysis, trading signals, price alerts, economic news, and partner program management.

## Quick start (local)

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase, Resend, and other keys.

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production server (after build) |
| `npm run start:worker` | Price alerts / push / email worker |
| `npm run start:worker:news` | News ingestion worker |
| `npm run check` | Pre-launch preflight checks (env, files, secrets scan) |
| `npm run preflight` | Same as `check` |
| `npm run security:audit` | Static security scan (optional, manual review) |

For deploy gates, run with strict env validation:

```bash
PREFLIGHT_STRICT=1 npm run check
```

## Pre-launch checks

Before every deploy:

```bash
npm run build
npm run check
```

After deploy, verify:

- Web: `GET /api/health` → 200 (or 503 if a dependency is down)
- Worker: `GET /health` → `{ "success": true, "status": "online" }`

See deployment and launch docs:

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — full deployment guide
- **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)** — complete verification checklist
- **[LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md)** — final Go/No-Go checklist
- **[ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)** — rollback procedure

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for Railway setup, environment variables, health checks, and worker configuration.

## Environment variables

See **[.env.example](./.env.example)** for the full list (no real secrets included).

**Never commit** `.env.local`, `.env`, or production keys to git.

## Health checks

- Web: `GET /api/health`
- Worker: `GET /health` (alerts worker only)

## Architecture

- **Web:** Next.js App Router — UI, API routes, middleware, ISR pages
- **Worker:** Express process — price alerts, Web Push, Resend email, optional OpenAI instant analysis
- **News worker:** Separate Node process — RSS/news pipeline, Telegram

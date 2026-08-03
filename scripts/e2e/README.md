# E2E / Smoke Test Infrastructure (Enterprise v2)

Production-safe internal QA runner — **not a user-facing feature**.

## Quick start

```bash
# 1. Copy env templates
cp .env.e2e.example .env.e2e.local

# 2. Fill credentials in .env.e2e.local (never commit)

# 3. Install browser + image diff tooling (one time)
npm install
npx playwright install chromium

# 4. First-time only — create permanent accounts
npm run e2e:provision

# 5. Run smoke before every release
npm run smoke:staging    # or smoke:local / smoke:production
```

## Multi-environment commands

| Command | Target URL source |
|---|---|
| `npm run smoke:local` | `http://localhost:3000` (or `LOCAL_URL`) |
| `npm run smoke:staging` | `STAGING_URL` from `.env.e2e.local` |
| `npm run smoke:production` | `PROD_URL` from `.env.e2e.local` |
| `npm run smoke` | `E2E_BASE_URL` fallback |

No code changes required — set URLs in `.env.e2e.local` only.

## Accounts

| Account | Username | Suggested email |
|---|---|---|
| User | `smoke-e2e-user` | `smoke-e2e-user@e2e.hasanchartworld.test` |
| Admin | `smoke-e2e-admin` | `smoke-e2e-admin@e2e.hasanchartworld.test` |

Run `npm run e2e:provision` once per environment (requires Supabase service role in `.env.local`).

## Visual regression & baselines

1. Smoke captures screenshots into a **timestamped run folder**.
2. Fixed filenames: `01-home.png` … `08-admin.png`.
3. If no baseline exists in `scripts/e2e/.baseline/`, the first capture **creates** it.
4. Subsequent runs compare with **pixelmatch** (~1% tolerance, anti-aliasing aware).
5. Failures are flagged as **VISUAL REGRESSION** in JSON + HTML reports.

Commit reviewed baselines after approved UI changes.

## HTML report

After each run:

- `scripts/e2e/.artifacts/reports/<runId>/smoke-report.html`
- Latest copy: `scripts/e2e/.artifacts/smoke-report.html`

Open locally in any browser — no server required.

Includes: **Release Gate** (verdict + score), Executive Summary, deployment checklist, blocking issues, release notes preview, step timings, screenshots, performance metrics, console/network capture, cleanup inventory.

## Release Gate

After every smoke run, **Release Gate** evaluates results automatically — no manual decision required.

Outputs:

- `json/<runId>/release-gate.json`
- Latest: `scripts/e2e/.artifacts/release-gate.json`
- Embedded at top of `smoke-report.html`

### Verdict rules

| Priority | Examples | Verdict impact |
|---|---|---|
| **P0** | Health, Auth, Instant Analysis, Subscription, Admin, Worker, Security | **NO-GO** |
| **P1** | Order Book, News, Visual Regression, Dashboard | **NO-GO** (unless `RELEASE_GATE_OVERRIDE=1`) |
| **P2** | Performance, Console warnings, BLOCKED/MANUAL | **GO WITH KNOWN ISSUES** |
| **P3** | VERIFY ONLY, minor theme/copy | **GO** |

### Production Readiness Score (0–100)

| Category | Weight |
|---|---|
| Health | 15 |
| Security | 15 |
| Tests | 20 |
| Performance | 15 |
| UX | 10 |
| Features | 15 |
| Build | 10 |

Score is derived from step PASS/FAIL ratios, health readiness, auth coverage, performance thresholds (LCP/load), and visual regression — not random numbers.

### When deployment is blocked

Release Gate returns **NO-GO** when any P0 or P1 blocking issue exists. CI/CD should read `release-gate.json` and fail the pipeline on `verdict: "NO-GO"`.

Re-evaluate an existing run without re-smoking:

```bash
node scripts/e2e/release-gate.mjs scripts/e2e/.artifacts/json/<runId>/smoke.json
```

## Artifact layout

```
scripts/e2e/
  .baseline/           # committed visual baselines
  .artifacts/
    screenshots/<runId>/
    reports/<runId>/
    logs/<runId>/
    json/<runId>/
    smoke-report.html      # latest HTML shortcut
    release-gate.json      # latest gate shortcut
```

JSON outputs:

- `json/<runId>/smoke.json` — full run payload + metadata
- `json/<runId>/cleanup-report.json` — cleanup inventory only
- `json/<runId>/release-gate.json` — GO / GO WITH KNOWN ISSUES / NO-GO + score + checklist

## Cleanup report

Smoke **never deletes** data. `cleanup-report.json` lists IDs/paths for manual cleanup:

- `userIds`, `requestIds`, `alertIds`, `uploadPaths`, `jobIds`, `storagePaths`

Review after each run; delete only after approval.

## Safety mode

Never executed — verify/read only:

- Subscription accept / reject / activate
- Partner commissions
- Email send / push broadcast
- News publish

## Markers

All smoke-created data uses: `SMOKE E2E`, `TEST ONLY`, `NO PAYMENT`.

## Production smoke

Use `npm run smoke:production` with `PROD_URL` set. Protected steps are **BLOCKED** without credentials. Public health, news, order book, and visual checks still run.

## Verify infrastructure (no smoke)

```bash
npm run e2e:verify
```

Checks syntax, npm scripts, imports, release gate evaluation, and folder layout without hitting any environment.

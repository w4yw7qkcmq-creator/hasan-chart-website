# Continuous Verification Platform

Lightweight post-deploy verification — **not full smoke**.

## vs Smoke

| | Smoke | Continuous Verification |
|---|---|---|
| When | Pre-deploy | Post-deploy (T+1m … T+24h) |
| Creates data | Yes (subscription upload) | **No** |
| Login | Yes | **No** — auth gate only |
| Instant Analysis POST | Yes | **No** — health GET only |
| Cooldown impact | Yes | **No** |

## Checkpoints

| ID | Delay | Command |
|---|---|---|
| t1m | T+1m | `npm run cv:checkpoint -- --id=t1m` |
| t5m | T+5m | `npm run cv:checkpoint -- --id=t5m` |
| t15m | T+15m | `npm run cv:checkpoint -- --id=t15m` |
| t1h | T+1h | `npm run cv:checkpoint -- --id=t1h` |
| t6h | T+6h | `npm run cv:checkpoint -- --id=t6h` |
| t24h | T+24h | `npm run cv:checkpoint -- --id=t24h` |

## Setup

```bash
cp .env.cv.example .env.cv.local
# Set STAGING_URL / PROD_URL / CV_ENVIRONMENT
```

## Manual run (production-safe)

```bash
# Dry-run (default — no network)
npm run cv:run

# Live probes (opt-in)
CV_LIVE=1 npm run cv:run:production
npm run cv:checkpoint -- --id=t1m --live
```

## npm commands

| Command | Purpose |
|---|---|
| `cv:verify` | Static verification |
| `cv:test` | Mock tests only |
| `cv:run` | Run CV (dry-run default) |
| `cv:run:production` | CV with CV_ENVIRONMENT=production |
| `cv:checkpoint -- --id=t1m` | Single checkpoint |
| `cv:report` | Refresh HTML from latest JSON |

## Artifacts

```
scripts/continuous-verification/.artifacts/
  continuous-verification.json
  continuous-verification-report.html
  timeline.json
  json/<runId>/
  reports/<runId>/
  incidents/<runId>/incidents.json
```

## Verdicts

- **HEALTHY** — all probes pass
- **DEGRADED** — warnings / single P1 / stale artifacts
- **UNHEALTHY** — P0 or multiple critical failures
- **INCOMPLETE** — checkpoints not yet run

## Incidents & recovery

Failed checkpoint → auto incident in artifacts. If a later checkpoint passes, incident → `recovered` with `recoveredAt`.

## Integration

- **Enterprise Operations** reads `continuous-verification.json` via `ops/cv-reader.mjs`
- **Release Gate** post-deploy via `evaluatePostDeployCv()` — does not affect pre-deploy gate

## Scheduling (no daemon)

Use external scheduler:

- **Railway Cron** — see `examples/railway-cron.md`
- **GitHub Actions** — see `examples/github-actions.yml` (manual-only)
- **CI** — trigger after deploy webhook

## Disable

Set `CV_DRY_RUN=1` or simply do not schedule checkpoints.

## Troubleshooting

See `scripts/ops/docs/runbooks/continuous-verification.md`

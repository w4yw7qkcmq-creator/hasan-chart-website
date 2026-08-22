# Worker Auth Soak Monitoring Runbook

## Baseline

Soak starts when Owner Web E2E validates machine identity. Baseline file:

`scripts/iam/.artifacts/worker-auth-soak-baseline-latest.json`

Registry:

`scripts/iam/.artifacts/worker-auth-soak-registry.json`

## Commands (read-only)

```bash
# Current health snapshot
node scripts/iam/monitor-worker-auth-soak.mjs --once

# Named checkpoint (when due)
node scripts/iam/monitor-worker-auth-soak.mjs --checkpoint=t1h

# Decision gate
node scripts/iam/monitor-worker-auth-soak.mjs --evaluate --json
```

## Checkpoints (from baseline)

| Checkpoint | Offset |
|---|---|
| t1h | +1 hour |
| t6h | +6 hours |
| t24h | +24 hours |
| t48h | +48 hours |
| t72h | +72 hours |

Late capture is allowed. Record actual `capturedAt`; do not backdate.

## Verdicts

- **PASS** — ready signal, no FAIL issues
- **WARN** — known restart, documented legacy probe, or no new machine traffic
- **FAIL** — auth misconfig, restart loop, price alert worker down, unexplained legacy repetition

## B2.4 gate

After T+72h, `--evaluate` may return:

- `SOAK_IN_PROGRESS` — before T+72h
- `READY_FOR_B2_4_REVIEW` — all checkpoints captured, no FAIL
- `EXTEND_SOAK` — missing checkpoints
- `ROLLBACK_RECOMMENDED` — FAIL on any checkpoint

Does **not** disable legacy fallback automatically.

## Incident response

On FAIL: do not change Production automatically. Choose:

1. Continue monitoring
2. Extend soak
3. Recommend rollback (requires explicit approval)

## Rollback references (historical — instant analysis retired Aug 2026)

- Keep `IAM_WORKER_LEGACY_FALLBACK=true`
- Keep `CRON_SECRET`
- Disable `instant-analysis-worker` account if secret compromise suspected

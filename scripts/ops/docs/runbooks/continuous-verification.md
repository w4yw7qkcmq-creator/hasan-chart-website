# Runbook: Continuous Verification

## T+1m failure

1. Open `continuous-verification-report.html`
2. Identify failed probe (web-health = SEV-1)
3. Check Railway logs immediately
4. Do **not** rollback on single transient failure — wait for T+5m

## T+5m recovery

- If T+1m failed but T+5m passes → incident auto-marked `recovered`
- Log in timeline; no rollback needed
- Monitor T+15m

## When to rollback

- P0 open after T+5m or T+15m
- `productionGate.rollbackRecommended === true`
- Web health + auth both FAIL

## When to wait

- Order book warmup timeout at T+1m only
- Single 503 with retry success
- Stale release-gate artifact (refresh smoke instead)

## Review evidence

- `continuous-verification.json` → probes[].evidence
- `incidents.json` → failedProbes, retries
- `timeline.json` → chronological events

## Commands

```bash
CV_LIVE=1 npm run cv:checkpoint -- --id=t5m
npm run cv:report
npm run ops:generate
```

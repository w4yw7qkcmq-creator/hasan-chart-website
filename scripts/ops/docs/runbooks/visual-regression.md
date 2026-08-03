# Runbook: Visual Regression (AR-004)

## Severity
**SEV-2 — Blocks release (P1)**

## Steps
1. Open diff images in `screenshots/<runId>/*.diff.png`
2. Determine: bug vs intentional UI change
3. If intentional: copy new screenshots to `scripts/e2e/.baseline/`
4. If bug: fix UI and re-run smoke

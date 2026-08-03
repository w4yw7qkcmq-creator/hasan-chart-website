# Runbook: Release Blocked (AR-010)

## Severity
**SEV-1 — Blocks deployment**

## Symptoms
- `release-gate.json` → `verdict: "NO-GO"`
- P0 or P1 blocking issues present

## Diagnosis
1. Open `release-gate.json` → `topBlockingIssues`
2. Map each issue to smoke step
3. Check severity: Critical/High first

## Recovery
1. Fix all P0 issues (health, auth, IA, admin, subscription)
2. Fix P1 issues (order book, news, visual regression)
3. Re-run smoke on target environment
4. Confirm `verdict: "GO"` or acceptable `"GO WITH KNOWN ISSUES"`

## Override (emergency only)
```bash
RELEASE_GATE_OVERRIDE=1 node scripts/e2e/release-gate.mjs <smoke.json>
```
Requires executive approval. Document in incident report.

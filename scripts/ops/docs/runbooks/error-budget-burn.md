# Runbook: Error Budget Burn (AR-005)

## Severity
**SEV-2**

## Steps
1. Review `error-budget.json` → `burnRate`
2. Identify breached SLO checks in `slo-report.json`
3. Prioritize fixes by P0/P1 impact
4. Pause non-critical deploys until burn < 0.5

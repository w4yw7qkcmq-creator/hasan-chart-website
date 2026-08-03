# Enterprise Operations — Runbooks Index

| Runbook | Trigger |
|---|---|
| [health-down.md](./health-down.md) | AR-001 — Health FAIL |
| [auth-failure.md](./auth-failure.md) | AR-002 — Auth FAIL |
| [order-book-degraded.md](./order-book-degraded.md) | AR-003 — Order Book |
| [visual-regression.md](./visual-regression.md) | AR-004 — Visual diff |
| [error-budget-burn.md](./error-budget-burn.md) | AR-005 — Error budget |
| [latency-degraded.md](./latency-degraded.md) | AR-006 — Latency SLO |
| [queue-backlog.md](./queue-backlog.md) | AR-007 — IA queue |
| [worker-down.md](./worker-down.md) | AR-008 — Worker unavailable |
| [release-blocked.md](./release-blocked.md) | AR-010 — Release Gate NO-GO |

## Usage

1. Alert fires in `alert-rules-status.json`
2. Open matching runbook
3. Follow steps; update incident timeline
4. Re-run `npm run ops:generate` after fix

# Enterprise Operations Platform

Operational layer on top of Enterprise QA (E2E + Release Gate). **Does not modify business logic.** **Does not probe live services** unless QA artifacts exist from a prior smoke run.

## Quick start

```bash
# 1. Run QA first (optional — ops works without it but with limited data)
npm run smoke:staging

# 2. Generate ops reports + dashboards
npm run ops:generate

# 3. Open local dashboards (no server)
open scripts/ops/.artifacts/index.html
```

## npm commands

| Command | Purpose |
|---|---|
| `npm run ops:generate` | Build JSON reports + HTML dashboards |
| `npm run ops:verify` | Static verify (syntax, imports, docs) |

## 30 Components

| # | Component | Output |
|---|---|---|
| 1 | Monitoring Dashboard | `monitoring-dashboard.html` |
| 2 | Health Dashboard | `health-dashboard.html` |
| 3 | Service Dependency Graph | `dependency-graph.json` + Mermaid in health dashboard |
| 4 | Error Budget Tracking | `error-budget.json` |
| 5 | SLO / SLA Verification | `slo-report.json` |
| 6 | Latency Monitoring | In ops-platform + monitoring dashboard |
| 7 | Queue Monitoring | IA queue status from smoke |
| 8 | Worker Monitoring | Health + smoke inference |
| 9 | Database Health | Supabase/auth smoke steps |
| 10 | Storage Health | Subscription upload step |
| 11 | Memory Monitoring | Framework placeholder (Railway integration ready) |
| 12 | CPU Monitoring | Framework placeholder |
| 13 | WebSocket/SSE Monitoring | market-stream smoke step |
| 14 | OpenAI Availability | instant-analysis smoke step |
| 15 | Supabase Monitoring | auth + storage + admin steps |
| 16 | Railway Monitoring | health commit/readiness |
| 17 | Automatic Incident Reports | `incident-report.json` |
| 18 | Alert Rules | `alert-rules-status.json` |
| 19 | Incident Timeline | In incident report + executive dashboard |
| 20 | Root Cause Templates | `docs/incidents/root-cause-templates.md` |
| 21 | Runbooks | `docs/runbooks/` |
| 22 | Recovery Playbooks | `docs/recovery/` |
| 23 | Canary Release Support | deployment-verification.json |
| 24 | Feature Flag Validation | deployment-verification.json |
| 25 | Rollback Verification | deployment-verification.json |
| 26 | Migration Verification | docs/checklists/migration-verify.md |
| 27 | Deployment Verification | `deployment-verification.json` |
| 28 | Blue/Green Readiness | deployment-verification.json |
| 29 | Production Readiness Dashboard | `production-readiness-dashboard.html` |
| 30 | Executive Dashboard | `executive-dashboard.html` |

## Artifact layout

```
scripts/ops/
  .artifacts/
    ops-platform.json          # master JSON
    index.html                 # dashboard hub
    monitoring-dashboard.html
    health-dashboard.html
    production-readiness-dashboard.html
    executive-dashboard.html
    json/<runId>/
      ops-platform.json
      slo-report.json
      error-budget.json
      dependency-graph.json
      incident-report.json
      alert-rules-status.json
      deployment-verification.json
    dashboards/<runId>/        # timestamped copies
  docs/
    runbooks/
    recovery/
    incidents/
    checklists/
```

## Before every Release

1. `npm run smoke:staging`
2. Confirm `release-gate.json` verdict
3. `npm run ops:generate`
4. Review `executive-dashboard.html`
5. Complete `docs/checklists/release-checklist.md`
6. Deploy only if verdict != NO-GO

## After every Release

1. `npm run smoke:production`
2. `npm run ops:generate`
3. Monitor `incident-report.json` for 30 minutes
4. Complete operational + launch checklists

## When deployment is blocked

- Release Gate **NO-GO** → alert AR-010 fires
- See `docs/runbooks/release-blocked.md`
- Fix P0/P1 issues → re-smoke → regenerate ops

## Integration with QA

Ops reads latest `scripts/e2e/.artifacts/json/<runId>/smoke.json` and `release-gate.json`. No duplicate test execution.

## Future live probes

Memory/CPU/Railway metrics placeholders accept future API integration without business logic changes.

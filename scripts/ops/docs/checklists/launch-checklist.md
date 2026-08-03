# Launch Checklist

For major launches (new features, marketing pushes).

## T-7 days
- [ ] Load test plan reviewed
- [ ] SLO targets confirmed
- [ ] Runbooks updated
- [ ] E2E accounts provisioned on staging

## T-1 day
- [ ] Full smoke on staging
- [ ] Production readiness dashboard green
- [ ] Blue/green or canary plan approved
- [ ] Incident response team on standby

## Launch day
- [ ] Pre-launch smoke:production (read-only checks OK)
- [ ] Deploy during low-traffic window
- [ ] Post-deploy smoke within 5 minutes
- [ ] ops:generate → executive dashboard review
- [ ] Monitor error budget burn

## T+1 day
- [ ] Post-launch smoke
- [ ] Incident retrospective if any SEV-2+
- [ ] Update baselines if UI changed
- [ ] Archive ops artifacts for run ID

## Go/No-Go Decision
**Automated:** `executive-dashboard.html` + `release-gate.json`

Manual sign-off required for GO WITH KNOWN ISSUES.

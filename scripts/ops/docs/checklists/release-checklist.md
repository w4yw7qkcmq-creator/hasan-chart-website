# Release Checklist

## Before Release
- [ ] All PRs merged to release branch
- [ ] `npm run e2e:verify` PASS
- [ ] `npm run smoke:staging` PASS
- [ ] `release-gate.json` → GO or GO WITH KNOWN ISSUES
- [ ] Visual baselines reviewed/updated
- [ ] Migration checklist complete (see migration-verify.md)
- [ ] Feature flags validated in staging
- [ ] Rollback commit identified

## Deploy
- [ ] Deploy to staging first
- [ ] `npm run smoke:staging` post-deploy
- [ ] Canary phase 1 (if enabled)
- [ ] Deploy to production
- [ ] `npm run smoke:production` post-deploy

## After Release
- [ ] `npm run ops:generate`
- [ ] Executive dashboard: no SEV-1
- [ ] Monitor 30 min: health, order book, IA
- [ ] Release notes published
- [ ] Cleanup report scheduled

## Blockers (NO-GO)
Any P0/P1 in Release Gate → **do not deploy**

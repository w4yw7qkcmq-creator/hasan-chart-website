# Recovery: Full Rollback

## When
Release Gate NO-GO after deploy, or SEV-1 in production.

## Steps
1. Railway → select previous successful deployment → Redeploy
2. Verify commit matches last known-good (check ops-platform.json)
3. Run `npm run smoke:production`
4. Run `npm run ops:generate`
5. Confirm `release-gate.json` verdict != NO-GO
6. Monitor 30 minutes — order book, IA, auth

## RTO Target
4 hours (see SLA_TARGETS in config.mjs)

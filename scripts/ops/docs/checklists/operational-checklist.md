# Operational Checklist

Run before and after every operational change.

## Pre-change
- [ ] Review open incidents (`incident-report.json`)
- [ ] Confirm error budget > 50% remaining
- [ ] Backup/database snapshot if schema change
- [ ] Rollback plan documented
- [ ] On-call notified

## During change
- [ ] Monitor Railway deploy logs
- [ ] Watch alert rules (`alert-rules-status.json`)
- [ ] Canary phase metrics green (if applicable)

## Post-change
- [ ] `npm run smoke:staging` or `smoke:production`
- [ ] `npm run ops:generate`
- [ ] Release Gate != NO-GO
- [ ] Executive dashboard reviewed
- [ ] Cleanup report reviewed

## Symbols (deployment verification)
- ✓ pass
- ✕ fail
- ~ partial / manual / awaiting

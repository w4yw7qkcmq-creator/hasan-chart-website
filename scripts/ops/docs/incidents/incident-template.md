# Incident Report Template

```markdown
# Incident: INC-YYYYMMDD-NNN

## Summary
- **Severity:** SEV-1 / SEV-2 / SEV-3
- **Status:** Open / Mitigated / Resolved
- **Environment:** staging / production
- **Detected by:** Release Gate / Alert Rule AR-XXX

## Timeline
| Time (UTC) | Event |
|---|---|
| | Alert fired |
| | Investigation started |
| | Mitigation applied |
| | Resolved |

## Impact
- Users affected:
- Features degraded:
- SLO impact:

## Root Cause
[Use template from root-cause-templates/]

## Resolution
1.
2.

## Follow-up
- [ ] Update runbook
- [ ] Add smoke coverage
- [ ] Post-mortem if SEV-1
```

Auto-generated incidents appear in `incident-report.json`.

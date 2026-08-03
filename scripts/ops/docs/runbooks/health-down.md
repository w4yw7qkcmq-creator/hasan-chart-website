# Runbook: Health Down (AR-001)

## Severity
**SEV-1 — Critical**

## Symptoms
- `/api/health` returns non-200
- Release Gate: health step FAIL
- readiness != ready

## Diagnosis
1. Open smoke JSON → step `health` note
2. Check Railway dashboard for web + worker services
3. Verify env vars: `NEXT_PUBLIC_SUPABASE_URL`, Redis, worker keys

## Recovery
1. Restart Railway services (web → worker)
2. Check logs for startup errors
3. Re-run: `npm run smoke:staging`
4. Regenerate ops: `npm run ops:generate`

## Verification
- health step PASS
- readiness=ready in note

# Runbook: Auth Failure (AR-002)

## Severity
**SEV-1**

## Steps
1. Verify `E2E_USER_EMAIL` / `E2E_USER_PASS` in `.env.e2e.local`
2. Test `POST /api/auth/login` manually
3. Check Supabase Auth dashboard for user status
4. Verify `/api/auth/sync-session` cookie flow
5. Re-provision if needed: `npm run e2e:provision` (staging only)

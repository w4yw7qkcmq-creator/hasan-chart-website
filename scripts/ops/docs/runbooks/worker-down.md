# Runbook: Worker Down (AR-008)

## Steps
1. Check `/api/instant-analysis/health` in health step note
2. Railway → worker service logs
3. Verify `OPENAI_API_KEY`, Redis, Supabase service role
4. Restart worker; re-run smoke

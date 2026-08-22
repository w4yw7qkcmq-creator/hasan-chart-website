# Runbook: Worker Down (AR-008)

## Steps
1. Check price-alerts worker `/health` in smoke health step note
2. Railway → `hasan-chart-worker` service logs
3. Verify Supabase service role, VAPID keys, `RESEND_API_KEY`
4. Restart worker; re-run smoke

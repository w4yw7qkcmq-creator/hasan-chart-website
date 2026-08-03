# Runbook: Order Book Degraded (AR-003)

## Severity
**SEV-2 — High**

## Symptoms
- Order book shows 0/3 connected initially
- smoke step `order-book` FAIL or timeout

## Diagnosis
**Often false positive** — bootstrap delay 1–3s (sometimes 15–20s).

1. Check REST: `/api/market-depth/snapshot?symbol=BTCUSDT`
2. Wait 15–20s before concluding failure
3. Check `market-stream` SSE step

## Recovery
1. Verify Binance/Bybit/OKX connectivity from worker region
2. Restart market-depth hub if stale
3. Re-run smoke with retry (built-in)

## Root Cause Template
Market depth snapshot did not reach connected exchanges within warmup window.

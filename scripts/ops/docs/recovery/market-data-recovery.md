# Recovery: Market Data

## Steps
1. Wait 20s — bootstrap delay is normal
2. Check `/api/market-depth/snapshot` REST directly
3. Verify exchange WS from server region
4. Restart web service if hub stale
5. Smoke: order-book + market-stream

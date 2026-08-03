# Root Cause Analysis Templates

## Health / Infrastructure
Service health endpoint returned non-200 or readiness != ready. Check Railway logs, env vars, and worker connectivity.

## Authentication
Authentication pipeline failed. Verify Supabase Auth, cookie sync, and E2E credentials.

## Order Book
Market depth snapshot did not reach connected exchanges within warmup window. Check MarketDepthHub WS to Binance/Bybit/OKX.

## Visual Regression
UI differed from baseline beyond tolerance. Review diff images; update baselines if intentional.

## Worker
Background worker unavailable. Check Railway worker service, Redis queue, and OPENAI_API_KEY.

## Latency
Page load or LCP exceeded SLO threshold. Profile slow routes and optimize critical path.

## Release Blocked
Release Gate returned NO-GO. Resolve all P0/P1 blocking issues before deploy.

---

Use in incident reports. Auto-populated in `ops-platform.json` → `rootCauseTemplates`.

# Runbook: Latency Degraded (AR-006)

## Steps
1. Review `latencyMonitoring.pages` in ops-platform.json
2. Focus pages with LCP > 4000ms or load > 8000ms
3. Profile slow routes; check CDN and API waterfalls

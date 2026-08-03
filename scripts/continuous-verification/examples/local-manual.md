# Local / CI manual execution

```bash
# After deploy — record deploy time
export CV_EXPECTED_COMMIT=$(git rev-parse HEAD)

# Run checkpoints on schedule (manual or CI wait)
sleep 60  && CV_LIVE=1 npm run cv:checkpoint -- --id=t1m --live
sleep 300 && CV_LIVE=1 npm run cv:checkpoint -- --id=t5m --live
# ... etc

# Regenerate ops dashboards
npm run ops:generate
```

Use CI `sleep` or scheduled jobs — no in-app daemon.

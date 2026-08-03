# Railway Cron Integration (documentation only)

Do **not** enable until post-deploy CV is validated on staging.

## Example Railway cron service

Schedule checkpoints after deploy:

| Cron | Checkpoint |
|---|---|
| `*/1 * * * *` (once) | t1m — use one-shot job instead |
| Custom delay jobs | t5m, t15m, t1h, t6h, t24h |

## Recommended approach

1. Deploy hook triggers script with `DEPLOY_TIME`
2. Railway cron or external scheduler calls:

```bash
CV_LIVE=1 CV_ENVIRONMENT=production CV_EXPECTED_COMMIT=$RAILWAY_GIT_COMMIT npm run cv:checkpoint -- --id=t1m
```

## Env vars on Railway

- `CV_ENVIRONMENT=production`
- `PROD_URL=https://www.hasanchartworld.com`
- `CV_EXPECTED_COMMIT` from deploy metadata

## Safety

- GET-only probes
- No account credentials required
- Fail job exits 1 for alerting integration

# Album Finalization Liveness — Phase 2A.1 (Event-Driven)

## Problem with Phase 2A

Phase 2A used `setInterval(..., 15s)` in the Web process:

- ~172,800 idle DB sweeps/month/replica with zero pending albums
- Violates **FINAL COST PRINCIPLE**: Telegram is not monitored; webhooks are the only trigger

## Selected Mechanism

### 1. Per-album timers (event-driven)

When an album webhook member is buffered:

1. Persist buffer/state in DB (source of truth)
2. Update `finalize_after = now + 3s`
3. Schedule **one** in-process `setTimeout` for that `(channel_id, media_group_id)`
4. New member → **cancel/reschedule** timer to the new `finalize_after`
5. Timer fires → DB claim via `finalizeOneAlbumGroup` → finalize/reject → remove timer

**Idle state:** zero pending albums ⇒ **zero timers**, zero recurring DB queries.

### 2. Process startup recovery (P0)

**Mechanism:** Next.js [`instrumentation.js`](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation) `register()` hook.

**Already used in this project** for market stream + symbol registry warmup.

**Why this is reliable:**

| Requirement | Evidence |
|-------------|----------|
| Runs once per Node server process | `register()` in root `instrumentation.js`, guarded by `NEXT_RUNTIME === "nodejs"` |
| Runs on `npm run start` | Same path as existing `startMarketStream()` production boot hook |
| Server-only | `NEXT_RUNTIME === "nodejs"` branch — not edge/browser |
| No duplicate loops | `startupRecoveryPromise` singleton + timer registry replaces (does not stack) timers |
| Railway restart/redeploy | New process → `register()` → one recovery DB query |

On startup:

1. **One** query: `telegram_media_group_state WHERE status='buffering'`
2. For each group:
   - `finalize_after <= now` → finalize immediately
   - else → recreate per-group timer for remaining delay

**Does not depend on** webhook route import, manual cron, or another Telegram post.

### 3. Cron recovery endpoint (optional ops only)

`POST /api/cron/telegram-content-finalize` — CRON_SECRET, **not required** for liveness.

### 4. Operational cleanup (throttled)

`maybeRunOperationalCleanup()` — max once per hour, triggered opportunistically after successful ingestion/finalization (not on idle sweep).

## Multi-replica

Each replica may restore a timer for the same group after restart. Acceptable: `finalizeOneAlbumGroup` uses atomic DB claim (`buffering → finalizing`).

## FINAL COST PRINCIPLE

- No Telegram polling
- No recurring DB sweep when idle
- No new worker/service
- Webhook-driven ingestion + per-album timers only when albums exist
- One-time recovery query on process boot only

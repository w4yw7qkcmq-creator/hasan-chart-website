import { computePersistenceScore } from "./persistence-score.js";
import { buildLiquidityWallKey, WALL_REAPPEAR_GRACE_MS } from "./wall-detector.js";

export class LiquidityWallTracker {
  /**
   * @param {{ now?: () => number, reappearGraceMs?: number }} [options]
   */
  constructor(options = {}) {
    this.nowFn = options.now ?? (() => Date.now());
    this.reappearGraceMs = options.reappearGraceMs ?? WALL_REAPPEAR_GRACE_MS;
    /** @type {Map<string, object>} */
    this.tracked = new Map();
    /** @type {Map<string, object>} */
    this.graceDisappeared = new Map();
  }

  /**
   * @param {{
   *   symbol: string,
   *   exchange: string,
   *   walls: Array<{
   *     side: "bid"|"ask",
   *     price: number,
   *     size: number,
   *     notional: number,
   *     distanceFromMid: number,
   *   }>,
   *   snapshotTime?: number,
   * }} batch
   * @returns {object[]}
   */
  ingestSnapshot(batch) {
    const snapshotTime = batch.snapshotTime ?? this.nowFn();
    const seenKeys = new Set();
    const updates = [];

    for (const wall of batch.walls || []) {
      const wallKey = buildLiquidityWallKey(batch.symbol, batch.exchange, wall.side, wall.price);
      seenKeys.add(wallKey);

      let state = this.tracked.get(wallKey);
      if (!state) {
        const grace = this.graceDisappeared.get(wallKey);
        if (grace && snapshotTime - grace.lastSeen <= this.reappearGraceMs) {
          state = grace;
          state.reappearCount = (state.reappearCount || 0) + 1;
          state.isActive = true;
          this.graceDisappeared.delete(wallKey);
        }
      }

      if (!state) {
        state = {
          wallKey,
          symbol: batch.symbol,
          exchange: batch.exchange,
          side: wall.side,
          price: wall.price,
          size: wall.size,
          notional: wall.notional,
          distanceFromMid: wall.distanceFromMid,
          snapshotTime,
          firstSeen: snapshotTime,
          lastSeen: snapshotTime,
          lifetimeSeconds: 0,
          appearanceCount: 1,
          maxSize: wall.size,
          averageSize: wall.size,
          sizeSamples: 1,
          reappearCount: 0,
          strongestNotional: wall.notional,
          survivedSnapshots: 1,
          isActive: true,
        };
      } else {
        state.lastSeen = snapshotTime;
        state.snapshotTime = snapshotTime;
        state.size = wall.size;
        state.notional = wall.notional;
        state.distanceFromMid = wall.distanceFromMid;
        state.appearanceCount += 1;
        state.survivedSnapshots += 1;
        state.maxSize = Math.max(state.maxSize, wall.size);
        state.sizeSamples = (state.sizeSamples || 1) + 1;
        state.averageSize =
          ((state.averageSize || wall.size) * (state.sizeSamples - 1) + wall.size) /
          state.sizeSamples;
        state.strongestNotional = Math.max(state.strongestNotional, wall.notional);
        state.lifetimeSeconds = Math.max(
          0,
          Math.floor((state.lastSeen - state.firstSeen) / 1000),
        );
        state.isActive = true;
      }

      state.persistenceScore = computePersistenceScore({
        lifetimeSeconds: state.lifetimeSeconds,
        appearanceCount: state.appearanceCount,
        averageSize: state.averageSize,
        maxSize: state.maxSize,
        survivedSnapshots: state.survivedSnapshots,
        reappearCount: state.reappearCount,
      });

      this.tracked.set(wallKey, state);
      updates.push({ ...state });
    }

    for (const [key, state] of this.tracked.entries()) {
      if (state.symbol !== batch.symbol || state.exchange !== batch.exchange) continue;
      if (seenKeys.has(key)) continue;
      state.isActive = false;
      this.graceDisappeared.set(key, state);
      this.tracked.delete(key);
      updates.push({ ...state });
    }

    const now = snapshotTime;
    for (const [key, state] of this.graceDisappeared.entries()) {
      if (now - state.lastSeen > this.reappearGraceMs) {
        this.graceDisappeared.delete(key);
      }
    }

    return updates;
  }

  drainPending() {
    const rows = [
      ...this.tracked.values(),
      ...this.graceDisappeared.values(),
    ];
    return rows.map((row) => ({ ...row }));
  }

  getTrackedCount() {
    return this.tracked.size;
  }

  clear() {
    this.tracked.clear();
    this.graceDisappeared.clear();
  }
}

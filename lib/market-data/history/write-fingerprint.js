/**
 * Stable fingerprints for market history DB writes.
 * Used to skip redundant upserts when payload is unchanged since last ack.
 */

/**
 * @param {Record<string, unknown>} row
 */
export function buildFlowBucketFingerprint(row) {
  return [
    row.symbol,
    row.exchangeScope,
    row.bucketStart,
    row.bucketSeconds,
    row.buyNotional,
    row.sellNotional,
    row.buyCount,
    row.sellCount,
    row.maxTradeNotional,
    row.large25kCount,
    row.large50kCount,
    row.large100kCount,
    row.large250kCount,
    row.large500kCount,
    row.large1mCount,
  ].join("|");
}

/**
 * @param {Record<string, unknown>} row
 */
export function buildLiquidityWallFingerprint(row) {
  return [
    row.wallKey,
    row.symbol,
    row.exchange,
    row.side,
    row.price,
    row.size,
    row.notional,
    row.distanceFromMid,
    row.snapshotTime,
    row.firstSeen,
    row.lastSeen,
    row.lifetimeSeconds,
    row.appearanceCount,
    row.persistenceScore,
    row.maxSize,
    row.averageSize,
    row.reappearCount,
    row.strongestNotional,
    row.survivedSnapshots,
    row.isActive,
  ].join("|");
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} keyFn
 * @returns {T[]}
 */
export function dedupeBatchByKey(rows, keyFn) {
  if (rows.length <= 1) return rows;
  /** @type {Map<string, T>} */
  const latest = new Map();
  for (const row of rows) {
    latest.set(keyFn(row), row);
  }
  return [...latest.values()];
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} keyFn
 * @param {(row: T) => string} fingerprintFn
 * @param {Map<string, string>} lastWritten
 * @returns {{ changed: T[], skipped: number }}
 */
export function filterUnchangedRows(rows, keyFn, fingerprintFn, lastWritten) {
  /** @type {T[]} */
  const changed = [];
  let skipped = 0;
  for (const row of rows) {
    const key = keyFn(row);
    const fingerprint = fingerprintFn(row);
    if (lastWritten.get(key) === fingerprint) {
      skipped += 1;
      continue;
    }
    changed.push(row);
  }
  return { changed, skipped };
}

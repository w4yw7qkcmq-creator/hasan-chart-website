import { buildLiquidityWallFingerprint } from "../write-fingerprint.js";

export class LiquidityWallWriteState {
  constructor() {
    /** @type {Map<string, string>} */
    this.lastWrittenFingerprints = new Map();
    this.skippedUnchangedWrites = 0;
    this.skippedDuplicateKeys = 0;
  }

  /**
   * @param {Record<string, unknown>} row
   * @returns {boolean}
   */
  shouldQueue(row) {
    const fingerprint = buildLiquidityWallFingerprint(row);
    const previous = this.lastWrittenFingerprints.get(row.wallKey);
    if (previous === fingerprint) {
      this.skippedUnchangedWrites += 1;
      return false;
    }
    return true;
  }

  /**
   * @param {Array<Record<string, unknown>>} rows
   */
  markWritten(rows) {
    for (const row of rows) {
      this.lastWrittenFingerprints.set(row.wallKey, buildLiquidityWallFingerprint(row));
    }
  }

  snapshot() {
    return {
      trackedKeys: this.lastWrittenFingerprints.size,
      skippedUnchangedWrites: this.skippedUnchangedWrites,
      skippedDuplicateKeys: this.skippedDuplicateKeys,
    };
  }

  clear() {
    this.lastWrittenFingerprints.clear();
    this.skippedUnchangedWrites = 0;
    this.skippedDuplicateKeys = 0;
  }
}

import { BUCKET_MS, HISTORY_WINDOW_MS, HISTORY_WINDOW_OPTIONS } from "./constants.js";

/** Coverage below this ratio is treated as partial data. */
export const FULL_COVERAGE_THRESHOLD = 0.99;

/**
 * @param {string} window
 * @returns {boolean}
 */
export function isValidHistoryWindow(window) {
  return Object.prototype.hasOwnProperty.call(HISTORY_WINDOW_MS, window);
}

/**
 * @param {string} window
 * @returns {number}
 */
export function getWindowMs(window) {
  if (!isValidHistoryWindow(window)) {
    throw new Error(`Invalid history window: ${window}`);
  }
  return HISTORY_WINDOW_MS[window];
}

/**
 * @param {string} window
 * @returns {number}
 */
export function getExpectedBucketCount(window) {
  return getWindowMs(window) / BUCKET_MS;
}

/**
 * @param {string} window
 * @param {number} now
 * @returns {number}
 */
export function getWindowStart(window, now) {
  return now - getWindowMs(window);
}

/**
 * @param {number} ts
 * @returns {number}
 */
export function floorToMinute(ts) {
  if (!Number.isFinite(ts)) {
    throw new Error("Invalid timestamp for floorToMinute");
  }
  return Math.floor(ts / BUCKET_MS) * BUCKET_MS;
}

/**
 * Unified historical coverage for a requested window.
 *
 * coverageRatio = clamp(actualBucketCount / expectedBucketCount, 0, 1)
 * completeness (legacy) = coverageRatio (0..1, not percent)
 *
 * @param {{
 *   bucketCount: number,
 *   window: string,
 * }} params
 * @returns {{
 *   expectedBucketCount: number,
 *   actualBucketCount: number,
 *   missingBucketCount: number,
 *   coverageRatio: number,
 *   coveragePercent: number,
 *   completeness: number,
 *   partialData: boolean,
 *   expectedBuckets: number,
 *   actualBuckets: number,
 * }}
 */
export function calculateCoverage({ bucketCount, window }) {
  const expectedBucketCount = getExpectedBucketCount(window);
  const actualBucketCount =
    Number.isFinite(bucketCount) && bucketCount > 0 ? Math.floor(bucketCount) : 0;
  const coverageRatio =
    expectedBucketCount === 0
      ? 0
      : Math.min(1, actualBucketCount / expectedBucketCount);
  const missingBucketCount = Math.max(0, expectedBucketCount - actualBucketCount);
  const coveragePercent = coverageRatio * 100;
  const partialData = coverageRatio < FULL_COVERAGE_THRESHOLD;

  return {
    expectedBucketCount,
    actualBucketCount,
    missingBucketCount,
    coverageRatio,
    coveragePercent,
    completeness: coverageRatio,
    partialData,
    expectedBuckets: expectedBucketCount,
    actualBuckets: actualBucketCount,
  };
}

/**
 * @param {number} coveragePercent
 * @returns {string}
 */
export function formatCoveragePercent(coveragePercent) {
  const value = Number(coveragePercent);
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  if (value < 10) {
    return value.toFixed(1);
  }
  return String(Math.round(value));
}

/**
 * Backward-compatible alias. Prefer calculateCoverage.
 *
 * @param {{
 *   bucketCount: number,
 *   window: string,
 *   collectingSince?: number|null,
 *   now?: number,
 * }} params
 */
export function calculateCompleteness(params) {
  return calculateCoverage({
    bucketCount: params.bucketCount,
    window: params.window,
  });
}

export { HISTORY_WINDOW_OPTIONS };

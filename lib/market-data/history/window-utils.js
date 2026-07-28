import { BUCKET_MS, HISTORY_WINDOW_MS, HISTORY_WINDOW_OPTIONS } from "./constants.js";

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
 * @param {{
 *   bucketCount: number,
 *   window: string,
 *   collectingSince?: number|null,
 *   now: number,
 * }} params
 * @returns {{
 *   expectedBuckets: number,
 *   availableExpectedBuckets: number,
 *   actualBuckets: number,
 *   completeness: number,
 *   partialData: boolean,
 * }}
 */
export function calculateCompleteness({ bucketCount, window, collectingSince = null, now }) {
  const expectedBuckets = getExpectedBucketCount(window);
  const windowStart = getWindowStart(window, now);
  const effectiveStart =
    collectingSince != null && Number.isFinite(collectingSince)
      ? Math.max(windowStart, collectingSince)
      : windowStart;

  const elapsedMs = Math.max(0, now - effectiveStart);
  const availableExpectedBuckets = Math.min(
    expectedBuckets,
    Math.floor(elapsedMs / BUCKET_MS),
  );

  const actualBuckets = Number.isFinite(bucketCount) && bucketCount > 0 ? bucketCount : 0;
  const completeness =
    availableExpectedBuckets === 0
      ? 0
      : Math.min(1, actualBuckets / availableExpectedBuckets);
  const partialData =
    completeness < 1 ||
    (collectingSince != null && Number.isFinite(collectingSince) && collectingSince > windowStart);

  return {
    expectedBuckets,
    availableExpectedBuckets,
    actualBuckets,
    completeness,
    partialData,
  };
}

export { HISTORY_WINDOW_OPTIONS };

import { RETRY_POLICY } from "./config.mjs";

export function isRetryable(error, status) {
  if (RETRY_POLICY.noRetryStatuses.includes(status)) return false;
  const msg = String(error?.message || error || "");
  if (RETRY_POLICY.noRetryConditions.some((r) => r.test(msg))) return false;
  if (RETRY_POLICY.retryableStatuses.includes(status)) return true;
  return RETRY_POLICY.retryableErrors.some((r) => r.test(msg));
}

/**
 * @param {() => Promise<{ status: string, httpStatus?: number, error?: string }>} fn
 */
export async function withRetry(fn, { label = "probe" } = {}) {
  let last = null;
  for (let attempt = 0; attempt < RETRY_POLICY.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        ...result,
        attempts: attempt + 1,
        retried: attempt > 0,
        retryStatus: attempt > 0 ? "Retried Successfully" : "none",
      };
    } catch (error) {
      last = error;
      const status = error?.httpStatus || error?.status || 0;
      const canRetry = attempt < RETRY_POLICY.maxAttempts - 1 && isRetryable(error, status);
      if (!canRetry) {
        return {
          status: "FAIL",
          error: error?.message || String(error),
          attempts: attempt + 1,
          retried: attempt > 0,
          retryStatus: attempt > 0 ? "Retry Failed" : "none",
        };
      }
      const backoff = RETRY_POLICY.backoffMs[attempt] || 1000;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return {
    status: "FAIL",
    error: last?.message || String(last),
    attempts: RETRY_POLICY.maxAttempts,
    retried: true,
    retryStatus: "Retry Failed",
  };
}

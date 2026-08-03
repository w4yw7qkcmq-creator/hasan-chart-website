/**
 * Retry once on timeout-only failures for flaky network steps.
 * @param {() => Promise<{ status?: string, note?: string }>} fn
 * @param {{ label?: string, isTimeout?: (error: unknown) => boolean }} [options]
 */
export async function retryOnceOnTimeout(fn, options = {}) {
  const isTimeout =
    options.isTimeout ||
    ((error) => /timeout|timed out|not ready within|aborted|abort/i.test(String(error?.message || error)));

  try {
    const result = await fn();
    return { ...result, retried: false };
  } catch (firstError) {
    if (!isTimeout(firstError)) throw firstError;
    try {
      const result = await fn();
      return {
        ...result,
        retried: true,
        note: [result?.note, "Retried Successfully"].filter(Boolean).join(" — "),
      };
    } catch (secondError) {
      const message = `${options.label || "step"}: Retry Failed — ${secondError?.message || secondError}`;
      throw new Error(message);
    }
  }
}

export const DEFAULT_FETCH_TIMEOUT_MS = 5000;

export async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("FETCH_TIMEOUT"));
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError" || error?.message === "FETCH_TIMEOUT") {
      const timeoutError = new Error("FETCH_TIMEOUT");
      timeoutError.code = "FETCH_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function isTransientFetchError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const cause = String(error?.cause?.code || error?.cause?.message || "").toLowerCase();
  const combined = `${message} ${code} ${cause}`;

  return (
    combined.includes("fetch failed") ||
    combined.includes("fetch_timeout") ||
    combined.includes("econnreset") ||
    combined.includes("und_err_connect_timeout") ||
    combined.includes("connect timeout") ||
    combined.includes("network")
  );
}

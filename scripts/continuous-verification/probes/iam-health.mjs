/**
 * IAM health probe for Continuous Verification (GET-only, no auth required for health endpoint).
 */
export async function probeIamHealth(baseUrl) {
  const url = `${String(baseUrl || "").replace(/\/$/, "")}/api/iam/health`;
  const started = Date.now();
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual" });
    const durationMs = Date.now() - started;
    const status = response.status;
    // Health requires IAM_MANAGE — expect 401/403 when unauthenticated (endpoint exists)
    const ok = status === 401 || status === 403 || status === 200;
    return {
      name: "iam_health_endpoint",
      ok,
      status,
      durationMs,
      detail: ok ? "IAM health route reachable" : `Unexpected status ${status}`,
    };
  } catch (error) {
    return {
      name: "iam_health_endpoint",
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      detail: error?.message || "fetch failed",
    };
  }
}

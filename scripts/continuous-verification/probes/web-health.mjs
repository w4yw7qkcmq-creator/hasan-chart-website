import { USER_AGENT } from "../config.mjs";
import { withRetry } from "../retry.mjs";

export async function runWebHealth(ctx) {
  const t0 = Date.now();
  return withRetry(async () => {
    const { res, data } = await ctx.fetchJson("/api/health");
    const latencyMs = Date.now() - t0;
    if (res.status !== 200) throw Object.assign(new Error(`HTTP ${res.status}`), { httpStatus: res.status });
    if (data?.status !== "ok") throw new Error(`status != ok (${data?.status})`);
    if (data?.readiness !== "ready") throw new Error(`readiness=${data?.readiness}`);
    if (ctx.expectedCommit && data?.build?.commit && !String(data.build.commit).startsWith(ctx.expectedCommit.slice(0, 7))) {
      return {
        status: "WARN",
        latencyMs,
        note: `commit mismatch expected=${ctx.expectedCommit.slice(0, 7)} actual=${String(data.build.commit).slice(0, 7)}`,
        evidence: { commit: data.build.commit, readiness: data.readiness },
        priority: "P3",
      };
    }
    return {
      status: "PASS",
      latencyMs,
      evidence: { commit: data?.build?.commit, readiness: data.readiness },
      priority: null,
    };
  }, { label: "web-health" });
}

export function createFetch(baseUrl, fetchImpl = globalThis.fetch) {
  return async function fetchJson(path, { timeoutMs = 30_000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 200) }; }
      return { res, data };
    } finally {
      clearTimeout(timer);
    }
  };
}

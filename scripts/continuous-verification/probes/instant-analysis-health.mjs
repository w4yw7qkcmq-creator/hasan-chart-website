import { withRetry } from "../retry.mjs";

export async function runInstantAnalysisHealth(ctx) {
  const t0 = Date.now();
  return withRetry(async () => {
    const { res, data } = await ctx.fetchJson("/api/instant-analysis/health");
    const latencyMs = Date.now() - t0;
    if (res.status !== 200) throw Object.assign(new Error(`HTTP ${res.status}`), { httpStatus: res.status });
    if (data?.status !== "ok" && data?.configured !== true) {
      throw new Error(`IA health not ok configured=${data?.configured}`);
    }
    if (!data?.configured) throw new Error("configured=false");
    return { status: "PASS", latencyMs, evidence: { configured: data.configured }, priority: null };
  }, { label: "instant-analysis-health" });
}

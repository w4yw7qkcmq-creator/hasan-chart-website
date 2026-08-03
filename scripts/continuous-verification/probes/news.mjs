import { withRetry } from "../retry.mjs";

export async function runNews(ctx) {
  const t0 = Date.now();
  return withRetry(async () => {
    const { res, data } = await ctx.fetchJson("/api/news?limit=3");
    const latencyMs = Date.now() - t0;
    if (res.status !== 200) throw Object.assign(new Error(`HTTP ${res.status}`), { httpStatus: res.status });
    if (data?.success === false) throw new Error("news success=false");
    return {
      status: "PASS",
      latencyMs,
      evidence: { items: Array.isArray(data?.items) ? data.items.length : 0 },
      priority: null,
    };
  }, { label: "news" });
}

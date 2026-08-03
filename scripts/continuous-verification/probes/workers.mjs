import { withRetry } from "../retry.mjs";

/** Indirect worker signals — no worker restarts. */
export async function runWorkers(ctx) {
  const t0 = Date.now();
  return withRetry(async () => {
    const ia = await ctx.fetchJson("/api/instant-analysis/health");
    const news = await ctx.fetchJson("/api/news?limit=1");
    const latencyMs = Date.now() - t0;

    const signals = {
      aiWorker: ia.res.status === 200 && ia.data?.configured === true ? "ok" : "down",
      newsWorker: news.res.status === 200 && news.data?.success !== false ? "inferred-ok" : "degraded",
      priceAlertsWorker: "not-probed-directly",
      subscriptionWorker: "not-probed-directly",
    };

    if (signals.aiWorker === "down") {
      throw new Error("AI worker health signal down");
    }
    if (signals.newsWorker === "degraded") {
      return { status: "WARN", latencyMs, evidence: signals, priority: "P2", note: "news indirect signal degraded" };
    }
    return { status: "PASS", latencyMs, evidence: signals, priority: null };
  }, { label: "workers" });
}

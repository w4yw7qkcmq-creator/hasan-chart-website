import { runWebHealth } from "./web-health.mjs";
import { runInstantAnalysisHealth } from "./instant-analysis-health.mjs";
import { runOrderBook } from "./order-book.mjs";
import { runNews } from "./news.mjs";
import { runAuthGate } from "./auth-gate.mjs";
import { runWorkers } from "./workers.mjs";
import { runReleaseGate } from "./release-gate.mjs";
import { runOperationalSignals } from "./operational-signals.mjs";

export const PROBE_REGISTRY = Object.freeze({
  "web-health": { id: "web-health", run: runWebHealth, network: true },
  "instant-analysis-health": { id: "instant-analysis-health", run: runInstantAnalysisHealth, network: true },
  "order-book": { id: "order-book", run: runOrderBook, network: true },
  news: { id: "news", run: runNews, network: true },
  "auth-gate": { id: "auth-gate", run: runAuthGate, network: true },
  workers: { id: "workers", run: runWorkers, network: true },
  "release-gate": { id: "release-gate", run: runReleaseGate, network: false },
  "operational-signals": { id: "operational-signals", run: runOperationalSignals, network: false },
});

export function getProbeIdsForCheckpoint(checkpointId, map) {
  return map[checkpointId] || Object.keys(PROBE_REGISTRY);
}

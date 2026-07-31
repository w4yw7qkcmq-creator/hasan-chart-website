import { PROBE_TIMEOUT_MS } from "./dynamic-symbol-constants.js";

/** @typedef {"pending"|"supported"|"unsupported"|"unavailable"} ProbeExchangeOutcome */
/** @typedef {"probing"|"complete"|"failed"} ProbeStatus */

const probeMetrics = {
  probeSuccesses: 0,
  probeFailures: 0,
  probeTimeouts: 0,
};

/** @type {Map<string, { status: ProbeStatus, startedAt: number, candidateExchanges: string[], results: Record<string, ProbeExchangeOutcome>, finalizedAt?: number }>} */
const symbolProbes = new Map();

const INVALID_SYMBOL_PATTERN = /invalid|unknown symbol|not found|10001|51001|60018|symbol.*not/i;

export function classifyProbeConnectionSnapshot(snapshot, elapsedMs, timeoutMs = PROBE_TIMEOUT_MS) {
  if (snapshot?.synced && snapshot?.status === "connected") {
    return "supported";
  }

  if (snapshot?.lastError && INVALID_SYMBOL_PATTERN.test(String(snapshot.lastError))) {
    return "unsupported";
  }

  if (elapsedMs >= timeoutMs) {
    return "unavailable";
  }

  return "pending";
}

export function startSymbolProbe(symbol, candidateExchanges) {
  const normalized = String(symbol || "").toUpperCase();
  const existing = symbolProbes.get(normalized);
  if (existing?.status === "probing") {
    return existing;
  }

  const probe = {
    status: /** @type {ProbeStatus} */ ("probing"),
    startedAt: Date.now(),
    candidateExchanges: [...candidateExchanges],
    results: {},
  };

  for (const exchange of candidateExchanges) {
    probe.results[exchange] = "pending";
  }

  symbolProbes.set(normalized, probe);
  return probe;
}

export function recordProbeExchangeOutcome(symbol, exchange, outcome) {
  const normalized = String(symbol || "").toUpperCase();
  const probe = symbolProbes.get(normalized);
  if (!probe || probe.status !== "probing") return probe;

  if (outcome === "pending") return probe;

  probe.results[exchange] = outcome;
  return probe;
}

export function getSymbolProbeState(symbol) {
  const normalized = String(symbol || "").toUpperCase();
  return symbolProbes.get(normalized) || null;
}

export function summarizeProbeResults(probe) {
  const supportedExchanges = [];
  const unsupportedExchanges = [];
  const unavailableExchanges = [];

  for (const exchange of probe.candidateExchanges) {
    const outcome = probe.results[exchange] || "pending";
    if (outcome === "supported") supportedExchanges.push(exchange);
    else if (outcome === "unsupported") unsupportedExchanges.push(exchange);
    else if (outcome === "unavailable") unavailableExchanges.push(exchange);
  }

  return {
    expectedExchangeCount: probe.candidateExchanges.length,
    supportedExchanges,
    unsupportedExchanges,
    unavailableExchanges,
  };
}

export function isProbePending(probe) {
  if (!probe || probe.status !== "probing") return false;
  return Object.values(probe.results).some((value) => value === "pending");
}

export function finalizeSymbolProbe(symbol, { force = false } = {}) {
  const normalized = String(symbol || "").toUpperCase();
  const probe = symbolProbes.get(normalized);
  if (!probe || probe.status !== "probing") return null;

  const elapsedMs = Date.now() - probe.startedAt;
  const canFinalize = force || elapsedMs >= PROBE_TIMEOUT_MS || !isProbePending(probe);
  if (!canFinalize) return null;

  for (const exchange of probe.candidateExchanges) {
    if (probe.results[exchange] === "pending") {
      probe.results[exchange] = "unavailable";
      probeMetrics.probeTimeouts += 1;
    }
  }

  const summary = summarizeProbeResults(probe);
  probe.status = summary.supportedExchanges.length > 0 ? "complete" : "failed";
  probe.finalizedAt = Date.now();

  if (probe.status === "complete") {
    probeMetrics.probeSuccesses += 1;
  } else {
    probeMetrics.probeFailures += 1;
  }

  return { probe, summary };
}

export function getProbeMetrics() {
  return { ...probeMetrics };
}

export function getBootstrapActiveSymbolCount(activeSymbols = []) {
  return activeSymbols.filter((row) => row.source === "bootstrap" && row.referenceCount > 0).length;
}

export function resetProbeStateForTests() {
  symbolProbes.clear();
  probeMetrics.probeSuccesses = 0;
  probeMetrics.probeFailures = 0;
  probeMetrics.probeTimeouts = 0;
}

export function formatExchangeProbeLabel(outcome) {
  if (outcome === "supported") return "متصل";
  if (outcome === "unsupported") return "غير مدعومة لهذا الرمز";
  if (outcome === "unavailable") return "تعذر الاتصال مؤقتًا";
  return "جاري التحقق...";
}

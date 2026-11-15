const ENABLED_FLAG = "MEMORY_DIAGNOSTICS";
const GLOBAL_KEY = "__hcMemoryDiagnostics";

export const MEMORY_DIAGNOSTICS_INTERVAL_MS = 15 * 60 * 1000;

export const MEMORY_DIAGNOSTICS_FIELDS = [
  "rss",
  "heapUsed",
  "heapTotal",
  "external",
  "arrayBuffers",
  "albumTimers",
  "okxSubscribers",
  "okxConnections",
  "okxReconnects",
  "registryEntries",
  "readApiCacheEntries",
];

export function isMemoryDiagnosticsEnabled(env = process.env) {
  return env[ENABLED_FLAG] === "1";
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

export function buildMemoryDiagnosticsSample(memory, counts) {
  const sources = {
    rss: memory?.rss,
    heapUsed: memory?.heapUsed,
    heapTotal: memory?.heapTotal,
    external: memory?.external,
    arrayBuffers: memory?.arrayBuffers,
    albumTimers: counts?.albumTimers,
    okxSubscribers: counts?.okxSubscribers,
    okxConnections: counts?.okxConnections,
    okxReconnects: counts?.okxReconnects,
    registryEntries: counts?.registryEntries,
    readApiCacheEntries: counts?.readApiCacheEntries,
  };
  const sample = {};

  for (const field of MEMORY_DIAGNOSTICS_FIELDS) {
    sample[field] = finiteOrNull(sources[field]);
  }

  return sample;
}

export function formatMemoryDiagnosticsLog(sample, at) {
  return JSON.stringify({
    level: "info",
    event: "memory_diagnostics",
    at,
    intervalMs: MEMORY_DIAGNOSTICS_INTERVAL_MS,
    ...buildMemoryDiagnosticsSample(sample, sample),
  });
}

export async function readProductionComponentCounts() {
  const { getAlbumTimerRegistrySize } = await import(
    "./telegram-content/album-liveness-scheduler.js"
  );
  const { readMarketStreamResourceCounts } = await import("./okx-market-stream.js");
  const { getSymbolRegistryHealth } = await import("./market-data/symbol-registry.js");
  const { readReadApiCacheEntryCount } = await import("./server-read-cache.js");
  const okx = readMarketStreamResourceCounts();
  const registry = getSymbolRegistryHealth();

  return {
    albumTimers: getAlbumTimerRegistrySize(),
    okxSubscribers: okx.subscribers,
    okxConnections: okx.connections,
    okxReconnects: okx.reconnects,
    registryEntries: registry.registrySymbolCount,
    readApiCacheEntries: readReadApiCacheEntryCount(),
  };
}

export async function sampleMemoryDiagnostics({
  logger,
  readCounts,
  memoryUsage = process.memoryUsage,
  now = () => new Date(),
} = {}) {
  try {
    const counts = await readCounts();
    const sample = buildMemoryDiagnosticsSample(memoryUsage(), counts);
    logger(
      formatMemoryDiagnosticsLog(
        { ...sample, ...counts },
        now().toISOString()
      )
    );
  } catch {
    logger(JSON.stringify({ level: "error", event: "memory_diagnostics_failed" }));
  }
}

export function startMemoryDiagnostics({
  env = process.env,
  setIntervalImpl = setInterval,
  intervalMs = MEMORY_DIAGNOSTICS_INTERVAL_MS,
  logger = (line) => console.log(line),
  readCounts = readProductionComponentCounts,
  memoryUsage = () => process.memoryUsage(),
  now = () => new Date(),
} = {}) {
  if (!isMemoryDiagnosticsEnabled(env)) {
    return { started: false, reason: "disabled" };
  }

  const existing = globalThis[GLOBAL_KEY];
  if (existing?.timer || existing?.pending) {
    return { started: false, reason: "already_running" };
  }

  globalThis[GLOBAL_KEY] = { pending: true, timer: null };

  const timer = setIntervalImpl(() => {
    void sampleMemoryDiagnostics({ logger, readCounts, memoryUsage, now });
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  globalThis[GLOBAL_KEY] = { pending: false, timer };
  return { started: true, reason: "started" };
}

export function stopMemoryDiagnostics({ clearIntervalImpl = clearInterval } = {}) {
  const existing = globalThis[GLOBAL_KEY];
  if (existing?.timer) {
    clearIntervalImpl(existing.timer);
  }
  delete globalThis[GLOBAL_KEY];
}

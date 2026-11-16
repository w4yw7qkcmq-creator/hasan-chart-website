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

export const WEBSITE_ROUTE_COUNT_KEYS = [
  "GET /api/health",
  "GET /api/news",
  "GET /api/market-depth/stream",
  "GET /api/market-stream",
  "AUTH",
  "OTHER",
];

const ROUTE_COUNTER_KEY = "__hcWebsiteRouteCounts";
const ROUTE_COUNTER_INSTALLED = "__hcWebsiteRequestCounterInstalled";

function emptyRouteCounts() {
  return {
    "GET /api/health": 0,
    "GET /api/news": 0,
    "GET /api/market-depth/stream": 0,
    "GET /api/market-stream": 0,
    "AUTH": 0,
    "OTHER": 0,
  };
}

function pathnameOnly(rawUrl) {
  const queryAt = rawUrl.indexOf("?");
  const withoutQuery = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt);
  const hashAt = withoutQuery.indexOf("#");
  return hashAt === -1 ? withoutQuery : withoutQuery.slice(0, hashAt);
}

function isAuthPath(pathname) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/iam" ||
    pathname.startsWith("/api/iam/") ||
    pathname === "/api/admin-reply"
  );
}

export function classifyWebsiteRoute(method, rawUrl) {
  if (typeof method !== "string" || typeof rawUrl !== "string") return "OTHER";
  const pathname = pathnameOnly(rawUrl);
  if (isAuthPath(pathname)) return "AUTH";
  if (method !== "GET") return "OTHER";
  if (
    pathname === "/api/health" ||
    pathname === "/api/news" ||
    pathname === "/api/market-depth/stream" ||
    pathname === "/api/market-stream"
  ) {
    return `GET ${pathname}`;
  }
  return "OTHER";
}

export function readWebsiteRouteCounts() {
  const source = globalThis[ROUTE_COUNTER_KEY];
  const counts = emptyRouteCounts();
  for (const key of WEBSITE_ROUTE_COUNT_KEYS) {
    const value = source?.[key];
    counts[key] = Number.isInteger(value) && value >= 0 ? value : 0;
  }
  return counts;
}

export function noteWebsiteRequest(method, rawUrl) {
  const counts = globalThis[ROUTE_COUNTER_KEY];
  if (!counts) return;
  try {
    const key = classifyWebsiteRoute(method, rawUrl);
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] += 1;
    } else {
      counts.OTHER += 1;
    }
  } catch {
    // Counting must not affect request handling.
  }
}

async function loadNodeHttp() {
  const { createRequire } = await import(/* webpackIgnore: true */ "node:module");
  return createRequire("/")("http");
}

export async function installWebsiteRequestCounter({
  env = process.env,
  loadHttp = loadNodeHttp,
} = {}) {
  if (!isMemoryDiagnosticsEnabled(env)) {
    return { installed: false, reason: "disabled" };
  }
  if (globalThis[ROUTE_COUNTER_INSTALLED]) {
    return { installed: true, reason: "already_installed" };
  }

  const http = await loadHttp();
  const proto = http?.Server?.prototype;
  if (!proto || typeof proto.emit !== "function") {
    throw new Error("http server unavailable");
  }
  if (proto[ROUTE_COUNTER_INSTALLED]) {
    globalThis[ROUTE_COUNTER_INSTALLED] = true;
    return { installed: true, reason: "already_installed" };
  }

  const originalEmit = proto.emit;
  proto.emit = function websiteRequestCounterEmit(event, req, res, ...rest) {
    if (event === "request") {
      try {
        noteWebsiteRequest(req?.method, req?.url);
      } catch {
        // Counting must not affect request handling.
      }
    }
    return originalEmit.call(this, event, req, res, ...rest);
  };
  proto[ROUTE_COUNTER_INSTALLED] = true;
  globalThis[ROUTE_COUNTER_KEY] = Object.seal(emptyRouteCounts());
  globalThis[ROUTE_COUNTER_INSTALLED] = true;
  return { installed: true, reason: "installed" };
}

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
  sample.routeCounts = readWebsiteRouteCounts();

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

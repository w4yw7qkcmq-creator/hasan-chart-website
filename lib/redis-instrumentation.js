import { AsyncLocalStorage } from "async_hooks";

const TRACKED_REDIS_METHODS = new Set([
  "get",
  "set",
  "del",
  "ping",
  "keys",
  "incr",
  "mget",
  "eval",
  "expire",
]);

export const redisRequestContext = new AsyncLocalStorage();

function getActiveRoute(explicitRoute) {
  if (explicitRoute) {
    return explicitRoute;
  }

  const contextRoute = redisRequestContext.getStore()?.route;
  if (contextRoute) {
    return contextRoute;
  }

  return null;
}

const minuteStats = {
  get: 0,
  set: 0,
  del: 0,
  ping: 0,
  rateLimit: 0,
  verify: 0,
  other: 0,
  sources: new Map(),
};

let minuteReportTimer = null;

const MARKET_PULSE_SET_STACK_COOLDOWN_MS = 5 * 60 * 1000;
let lastMarketPulseSetStackLoggedAt = 0;

function getRawRedisKey(key) {
  if (key == null) return "";
  if (Array.isArray(key)) {
    return key.length > 0 ? String(key[0]) : "";
  }
  return String(key);
}

function isMarketPulseKey(key) {
  const value = getRawRedisKey(key);
  return value.includes("hc:market-pulse");
}

function getCompactStackTrace(stack) {
  const lines = (stack || "").split("\n").slice(2);
  const compact = [];

  for (const line of lines) {
    if (line.includes("redis-instrumentation")) continue;

    const trimmed = line.trim();
    if (!trimmed) continue;

    compact.push(trimmed);
    if (compact.length >= 8) break;
  }

  return compact;
}

function maybeLogMarketPulseSetStackTrace({ key, caller, success, error }) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const now = Date.now();

  if (
    lastMarketPulseSetStackLoggedAt > 0 &&
    now - lastMarketPulseSetStackLoggedAt < MARKET_PULSE_SET_STACK_COOLDOWN_MS
  ) {
    return;
  }

  lastMarketPulseSetStackLoggedAt = now;

  console.log(
    "redis-usage:market-pulse-set-trace",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      operation: "set",
      key: getRawRedisKey(key) || sanitizeKeyPrefix(key),
      source: caller.source,
      function: caller.function,
      success,
      error: error ? String(error) : null,
      stack: getCompactStackTrace(new Error().stack || ""),
    })
  );
}

function getCallerMeta() {
  const stack = new Error().stack || "";
  const lines = stack.split("\n");

  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("redis-instrumentation")) continue;
    if (line.includes("node_modules")) continue;

    const fnMatch = line.match(/at (?:async )?([^ (]+)/);
    const fileMatch =
      line.match(/\/lib\/([^):]+)/) ||
      line.match(/\/app\/([^):]+)/) ||
      line.match(/lib\\([^):]+)/) ||
      line.match(/app\\([^):]+)/);

    if (fileMatch || fnMatch) {
      const file = fileMatch
        ? fileMatch[1].includes("app/")
          ? fileMatch[1]
          : `lib/${fileMatch[1]}`
        : "unknown";
      return {
        source: file,
        function: fnMatch?.[1] || "anonymous",
      };
    }
  }

  return { source: "unknown", function: "unknown" };
}

function sanitizeKeyPrefix(key) {
  if (key == null) return "none";

  if (Array.isArray(key)) {
    return key.length > 0 ? sanitizeKeyPrefix(key[0]) : "none";
  }

  const value = String(key);

  if (value.startsWith("hc:read-cache:")) return "hc:read-cache:*";
  if (value.startsWith("hc:market-pulse:")) return "hc:market-pulse:*";
  if (value.startsWith("hasan-chart:")) {
    const parts = value.split(":");
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}:*` : "hasan-chart:*";
  }

  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) {
    return value.slice(0, 24) || "none";
  }

  return `${value.slice(0, colonIndex + 1)}*`;
}

function incrementSource(sourceKey, operation) {
  const current = minuteStats.sources.get(sourceKey) || {
    total: 0,
    operations: {},
  };

  current.total += 1;
  current.operations[operation] = (current.operations[operation] || 0) + 1;
  minuteStats.sources.set(sourceKey, current);
}

function incrementOperation(operation) {
  if (operation === "get") minuteStats.get += 1;
  else if (operation === "set") minuteStats.set += 1;
  else if (operation === "del") minuteStats.del += 1;
  else if (operation === "ping") minuteStats.ping += 1;
  else if (operation === "rateLimit") minuteStats.rateLimit += 1;
  else if (operation === "verify") minuteStats.verify += 1;
  else minuteStats.other += 1;
}

function shouldLogIndividualRedisCalls() {
  return process.env.NODE_ENV !== "production";
}

export function recordRedisUsage({
  operation,
  source,
  function: functionName,
  keyPrefix = "none",
  route = null,
  success = true,
  error = null,
  meta = null,
}) {
  const caller = source
    ? { source, function: functionName || "unknown" }
    : getCallerMeta();
  const activeRoute = getActiveRoute(route);
  const sourceKey = `${caller.source}#${caller.function}`;

  incrementOperation(operation);
  incrementSource(sourceKey, operation);

  if (!shouldLogIndividualRedisCalls()) {
    return;
  }

  console.log(
    "redis-usage:call",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      operation,
      source: caller.source,
      function: caller.function,
      keyPrefix,
      route: activeRoute,
      success,
      error: error ? String(error) : null,
      meta,
    })
  );
}

export function recordRateLimitUsage({
  prefix,
  identifier = "unknown",
  source,
  function: functionName,
  route = null,
  success = true,
  error = null,
}) {
  recordRedisUsage({
    operation: "rateLimit",
    source: source || "lib/rate-limit.js",
    function: functionName || "check",
    keyPrefix: prefix ? `${prefix}:*` : "rate-limit:*",
    route,
    success,
    error,
    meta: { identifierPrefix: String(identifier).slice(0, 16) },
  });
}

export function recordRedisVerifyUsage({
  source,
  function: functionName,
  route = null,
  success = true,
  skipped = false,
  error = null,
  meta = null,
}) {
  recordRedisUsage({
    operation: "verify",
    source: source || "lib/upstash-redis.js",
    function: functionName || "verifyUpstashRedis",
    keyPrefix: "redis:verify",
    route,
    success: skipped ? true : success,
    error,
    meta: skipped ? { skipped: true, reason: "fallback-active-or-cached", ...meta } : meta,
  });
}

export function flushRedisUsageReport() {
  const totalGet = minuteStats.get;
  const totalSet = minuteStats.set;
  const totalDel = minuteStats.del;
  const totalPing = minuteStats.ping;
  const totalRateLimit = minuteStats.rateLimit;
  const totalVerify = minuteStats.verify;
  const totalOther = minuteStats.other;

  const hasUsage =
    totalGet > 0 ||
    totalSet > 0 ||
    totalRateLimit > 0 ||
    totalPing > 0 ||
    totalVerify > 0 ||
    totalOther > 0;

  if (hasUsage) {
    const topSources = [...minuteStats.sources.entries()]
      .sort((left, right) => right[1].total - left[1].total)
      .slice(0, 5)
      .map(([source, stats]) => ({
        source,
        total: stats.total,
        operations: stats.operations,
      }));

    console.log(
      "redis-usage:summary",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        totalGet,
        totalSet,
        totalDel,
        totalPing,
        totalRateLimit,
        totalVerify,
        totalOther,
        topSources,
      })
    );
  }

  minuteStats.get = 0;
  minuteStats.set = 0;
  minuteStats.del = 0;
  minuteStats.ping = 0;
  minuteStats.rateLimit = 0;
  minuteStats.verify = 0;
  minuteStats.other = 0;
  minuteStats.sources.clear();
}

export function runWithRedisRoute(route, callback) {
  return redisRequestContext.run({ route }, callback);
}

export function createInstrumentedRedis(redis) {
  if (!redis || redis.__hcInstrumented) {
    return redis;
  }

  return new Proxy(redis, {
    get(target, prop, receiver) {
      if (prop === "__hcInstrumented") {
        return true;
      }

      const value = Reflect.get(target, prop, receiver);

      if (typeof value !== "function") {
        return value;
      }

      if (prop === "pipeline") {
        return (...args) => createInstrumentedRedis(value.apply(target, args));
      }

      return async function instrumentedRedisMethod(...args) {
        const operation = TRACKED_REDIS_METHODS.has(String(prop)) ? String(prop) : "other";
        const rawKey = getRawRedisKey(args[0]);
        const keyPrefix = sanitizeKeyPrefix(args[0]);
        const caller = getCallerMeta();
        const shouldTraceMarketPulseSet =
          operation === "set" && isMarketPulseKey(rawKey);

        try {
          const result = await value.apply(target, args);

          if (shouldTraceMarketPulseSet) {
            maybeLogMarketPulseSetStackTrace({
              key: rawKey,
              caller,
              success: true,
            });
          }

          recordRedisUsage({
            operation,
            source: caller.source,
            function: caller.function,
            keyPrefix,
            success: true,
          });
          return result;
        } catch (error) {
          if (shouldTraceMarketPulseSet) {
            maybeLogMarketPulseSetStackTrace({
              key: rawKey,
              caller,
              success: false,
              error: error?.message || String(error),
            });
          }

          recordRedisUsage({
            operation,
            source: caller.source,
            function: caller.function,
            keyPrefix,
            success: false,
            error: error?.message || String(error),
          });
          throw error;
        }
      };
    },
  });
}

export function startRedisUsageReporter() {
  if (minuteReportTimer || typeof setInterval !== "function") {
    return;
  }

  minuteReportTimer = setInterval(flushRedisUsageReport, 60000);
  if (typeof minuteReportTimer.unref === "function") {
    minuteReportTimer.unref();
  }
}

if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "nodejs") {
  startRedisUsageReporter();
}

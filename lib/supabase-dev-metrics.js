import { AsyncLocalStorage } from "async_hooks";

const metricsContext = new AsyncLocalStorage();

export function runWithSupabaseMetrics(route, callback) {
  return metricsContext.run({ route, queryCount: 0 }, callback);
}

export function incrementSupabaseQuery() {
  const store = metricsContext.getStore();
  if (store) {
    store.queryCount += 1;
  }
}

export function getSupabaseQueryCount() {
  return metricsContext.getStore()?.queryCount ?? 0;
}

export function getSupabaseMetricsRoute() {
  return metricsContext.getStore()?.route ?? null;
}

export function instrumentSupabaseClient(client) {
  if (process.env.NODE_ENV !== "development") {
    return client;
  }

  if (!client || client.__hcSupabaseInstrumented) {
    return client;
  }

  const originalFrom = client.from.bind(client);

  client.from = function instrumentedFrom(...args) {
    incrementSupabaseQuery();
    return originalFrom(...args);
  };

  Object.defineProperty(client, "__hcSupabaseInstrumented", {
    value: true,
    enumerable: false,
  });

  return client;
}

export function logDevRoutePerf({ route, elapsedMs, supabaseQueries, status }) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const payload = {
    route,
    elapsedMs,
    supabaseQueries,
    status,
  };

  if (elapsedMs >= 1000) {
    console.warn("[api-dev-perf] SLOW_ROUTE", JSON.stringify(payload));
    return;
  }

  if (elapsedMs >= 250 || supabaseQueries >= 3) {
    console.log("[api-dev-perf]", JSON.stringify(payload));
  }
}

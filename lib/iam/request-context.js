import { AsyncLocalStorage } from "async_hooks";
import { createClient } from "@supabase/supabase-js";
import { instrumentSupabaseClient } from "../supabase-dev-metrics.js";
import { assertServiceRoleKeyFromEnv } from "../auth-session-internals.js";

const requestAls = new AsyncLocalStorage();

/** @type {Map<string, { store: RequestIamStore, expiresAt: number }>} */
const storesByRequestId = new Map();
const REQUEST_STORE_TTL_MS = 120_000;
const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimerStarted = false;

function startCleanupTimer() {
  if (cleanupTimerStarted) return;
  cleanupTimerStarted = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of storesByRequestId.entries()) {
      if (entry.expiresAt <= now) storesByRequestId.delete(id);
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}

function createEmptyTimings() {
  return {
    supabaseClientMs: 0,
    authSessionMs: 0,
    iamResolveMs: 0,
    adminSessionMs: 0,
    sessionTouchMs: 0,
    rateLimitMs: 0,
  };
}

function createRequestIamStore() {
  return {
    supabaseAdmin: null,
    supabaseAdminPromise: null,
    authenticatedSessionPromise: null,
    /** @type {Map<string, Promise<object>>} */
    adminSessionPromises: new Map(),
    /** @type {Map<string, Promise<object>>} */
    iamContextPromises: new Map(),
    sessionTouchPromise: null,
    sessionTouchDone: false,
    /** @type {Map<string, Promise<object>>} */
    rateLimitPromises: new Map(),
    timings: createEmptyTimings(),
  };
}

async function readRequestIdFromHeaders() {
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    return String(headerStore.get("x-request-id") || "").trim() || null;
  } catch {
    return null;
  }
}

function touchRequestStoreEntry(entry) {
  entry.expiresAt = Date.now() + REQUEST_STORE_TTL_MS;
}

export function runWithRequestIamContext(fn) {
  return requestAls.run(createRequestIamStore(), fn);
}

export async function getRequestIamStore() {
  const alsStore = requestAls.getStore();
  if (alsStore) return alsStore;

  const requestId = await readRequestIdFromHeaders();
  if (!requestId) return createRequestIamStore();

  startCleanupTimer();
  let entry = storesByRequestId.get(requestId);
  if (!entry) {
    entry = { store: createRequestIamStore(), expiresAt: Date.now() + REQUEST_STORE_TTL_MS };
    storesByRequestId.set(requestId, entry);
  }
  touchRequestStoreEntry(entry);
  return entry.store;
}

export function getRequestIamTimings(store) {
  return store?.timings || createEmptyTimings();
}

export function logRequestIamTimings(store, meta = {}) {
  if (!store?.timings) return;
  const t = store.timings;
  const totalAuthMs =
    (t.supabaseClientMs || 0) +
    (t.authSessionMs || 0) +
    (t.iamResolveMs || 0) +
    (t.sessionTouchMs || 0) +
    (t.rateLimitMs || 0);

  if (totalAuthMs < 50 && !meta.force) return;

  console.info(
    "[iam-request-timing]",
    JSON.stringify({
      totalAuthMs,
      ...t,
      ...meta,
    })
  );
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = assertServiceRoleKeyFromEnv();

  if (!supabaseUrl) {
    throw new Error("Missing Supabase configuration");
  }

  return instrumentSupabaseClient(
    createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  );
}

/**
 * Request-scoped Supabase admin client (one instance per HTTP request).
 */
export async function getRequestSupabaseAdmin() {
  const store = await getRequestIamStore();
  if (store.supabaseAdmin) return store.supabaseAdmin;

  if (!store.supabaseAdminPromise) {
    const startedAt = Date.now();
    store.supabaseAdminPromise = Promise.resolve().then(() => {
      const client = createSupabaseAdminClient();
      store.timings.supabaseClientMs = Date.now() - startedAt;
      store.supabaseAdmin = client;
      return client;
    });
  }

  return store.supabaseAdminPromise;
}

/**
 * Memoize an async operation once per request key (concurrent-safe).
 */
export function memoizeRequestPromise(store, map, key, factory) {
  if (!store || !map || !key) return factory();
  const existing = map.get(key);
  if (existing) return existing;
  const promise = factory();
  map.set(key, promise);
  return promise;
}

export function adminSessionCacheKey(options = {}) {
  const organizationId = String(options.organizationId || "default").trim();
  const touch = options.touchSession === false ? "no-touch" : "touch";
  return `${organizationId}:${touch}`;
}

export function iamContextCacheKey(userId, organizationId) {
  return `${String(userId || "").trim()}:${String(organizationId || "default").trim()}`;
}

export function rateLimitCacheKey(request, kind) {
  try {
    const pathname = new URL(request.url).pathname;
    return `${kind}:${pathname}`;
  } catch {
    return `${kind}:unknown`;
  }
}

/** @internal tests */
export function __clearRequestIamStoresForTests() {
  storesByRequestId.clear();
}

/** @internal tests */
export function __getRequestIamStoreCountForTests() {
  return storesByRequestId.size;
}

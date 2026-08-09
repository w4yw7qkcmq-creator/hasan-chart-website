import { createClient } from "@supabase/supabase-js";
import { warmupSupabaseNetwork } from "./supabase-network";

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://lzgsxdsumnteuwtjfqlm.supabase.co";

export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_XCZkQPsJymbmnNuBR9fMpw_SVEFwZm0";

const memoryAuthStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function createSupabaseFetch() {
  const baseFetch =
    typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined;

  return async (input, init = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input?.url;
    const method =
      init?.method ||
      (typeof input === "object" && input?.method) ||
      "GET";
    const isAuthToken =
      typeof url === "string" &&
      url.includes("/auth/v1/token") &&
      url.includes("grant_type=password");
    const isPushSubscriptionsWrite =
      typeof url === "string" &&
      url.includes("/rest/v1/push_subscriptions") &&
      method !== "GET" &&
      method !== "HEAD";

    if (typeof window !== "undefined" && isPushSubscriptionsWrite) {
      console.error(
        "push:api:error",
        JSON.stringify({
          phase: "client_blocked",
          message:
            "push_subscriptions is server-only; use POST /api/push/subscribe",
          method,
        })
      );

      throw new Error(
        "push_subscriptions is server-only; use POST /api/push/subscribe"
      );
    }

    if (typeof window !== "undefined" && isAuthToken) {
      console.error(
        "auth:client:blocked",
        JSON.stringify({
          phase: "client_blocked",
          message: "Password login is server-only; use POST /api/auth/login",
        })
      );

      throw new Error(
        "Password login is server-only; use POST /api/auth/login"
      );
    }

    const started = Date.now();

    console.log("[SUPABASE FETCH] →", { method, url, isAuthToken });

    try {
      const response = await baseFetch(input, init);
      console.log("[SUPABASE FETCH] ←", {
        method,
        url,
        status: response.status,
        ms: Date.now() - started,
        isAuthToken,
      });
      return response;
    } catch (error) {
      console.error("[SUPABASE FETCH] ✗", {
        method,
        url,
        ms: Date.now() - started,
        error: error?.message || String(error),
        isAuthToken,
      });
      throw error;
    }
  };
}

const supabaseClientOptions = {
  auth: {
    storage: memoryAuthStorage,
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: createSupabaseFetch(),
    headers: {
      apikey: supabaseAnonKey,
    },
  },
};

function createBrowserSupabaseClient() {
  const client = createClient(supabaseUrl, supabaseAnonKey, supabaseClientOptions);

  if (typeof window !== "undefined") {
    const originalFrom = client.from.bind(client);

    client.from = (table) => {
      if (String(table) === "push_subscriptions") {
        console.error(
          "push:api:error",
          JSON.stringify({
            phase: "client_blocked",
            message:
              "push_subscriptions is server-only; use POST /api/push/subscribe",
          })
        );

        throw new Error(
          "push_subscriptions is server-only; use POST /api/push/subscribe"
        );
      }

      return originalFrom(table);
    };
  }

  return client;
}

const globalForSupabase = globalThis;

export const supabase =
  globalForSupabase.__hcSupabaseClient__ ?? createBrowserSupabaseClient();

if (typeof window !== "undefined") {
  globalForSupabase.__hcSupabaseClient__ = supabase;
  warmupSupabaseNetwork();
} else if (process.env.NODE_ENV !== "production") {
  globalForSupabase.__hcSupabaseClient__ = supabase;
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  let urlHost = null;

  try {
    urlHost = supabaseUrl ? new URL(supabaseUrl).host : null;
  } catch {
    urlHost = null;
  }

  console.log("[SUPABASE CLIENT] init", {
    urlHost,
    persistSession: false,
    customFetch: true,
  });
}

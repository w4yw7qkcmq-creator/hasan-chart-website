import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
});

if (typeof window !== "undefined") {
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

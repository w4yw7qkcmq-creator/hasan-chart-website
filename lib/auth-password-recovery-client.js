import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { clearPendingRecoveryParts } from "./auth-password-recovery";

let activeRecoverySession = null;

const memoryAuthStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function createRecoveryAuthClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: memoryAuthStorage,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getActiveRecoverySession() {
  return activeRecoverySession;
}

export function rememberActiveRecoverySession(session) {
  activeRecoverySession = session || null;
}

export async function releaseActiveRecoverySession() {
  const current = activeRecoverySession;
  activeRecoverySession = null;
  clearPendingRecoveryParts();
  if (current?.client) {
    await disposeRecoveryClient(current.client);
  }
}

export async function disposeRecoveryClient(client) {
  if (!client) return;

  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Isolated recovery client only — ignore local sign-out failures.
  }
}

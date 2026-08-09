import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  assertStagingSupabaseConfig,
} from "../../lib/staging-env-guard.js";

export function assertStagingOnly() {
  loadStagingEnvFile();
  const staging = assertStagingSupabaseConfig({
    projectRef: process.env.STAGING_SUPABASE_PROJECT_REF,
    url: process.env.STAGING_SUPABASE_URL,
  });
  if (staging.projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: staging config matches Production");
  }
  if (staging.projectRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`ABORT: unexpected staging ref ${staging.maskedProjectRef}`);
  }
  return staging;
}

export function createStagingClients() {
  assertStagingOnly();
  const url = process.env.STAGING_SUPABASE_URL;
  const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  return { service, anon, url, anonKey };
}

export async function stagingSelectAll(service, table, columns = "*", orderBy = null) {
  let q = service.from(table).select(columns);
  if (orderBy) q = q.order(orderBy);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

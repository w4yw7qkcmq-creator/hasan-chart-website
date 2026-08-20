#!/usr/bin/env node
import { createRequire } from "node:module";
import { config } from "dotenv";

config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const BUCKET = "news-images";
const PREFIXES = ["canary-", "benchmark-"];

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("SKIP canary cleanup: missing Supabase credentials");
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const folder = "news-images/2026/08";
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (error) {
    throw error;
  }

  const paths = (data || [])
    .filter((item) => PREFIXES.some((prefix) => item.name.startsWith(prefix)))
    .map((item) => `${folder}/${item.name}`);

  if (!paths.length) {
    console.log("CANARY_STORAGE_CLEANUP_PASS removed=0");
    return;
  }

  const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
  if (removeError) {
    throw removeError;
  }

  console.log(`CANARY_STORAGE_CLEANUP_PASS removed=${paths.length}`);
}

main().catch((error) => {
  console.error("CANARY_STORAGE_CLEANUP_FAIL", error.message);
  process.exit(1);
});

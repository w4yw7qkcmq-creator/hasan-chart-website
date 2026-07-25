#!/usr/bin/env node
/**
 * Expire stale subscription_upload_sessions (open past expires_at).
 * SAFE DEFAULT: dry-run unless --execute is passed.
 *
 * Usage:
 *   node scripts/cleanup-upload-sessions.js --dry-run
 *   node scripts/cleanup-upload-sessions.js --execute --limit 100
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { UPLOAD_SESSION_STATUS_EXPIRED, UPLOAD_SESSION_STATUS_OPEN } from "../lib/payment-proof-storage.js";

const DEFAULT_LIMIT = 200;

function parseArgs(argv) {
  const args = { dryRun: true, limit: DEFAULT_LIMIT };
  for (const arg of argv) {
    if (arg === "--execute") args.dryRun = false;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--limit=")) args.limit = Number(arg.split("=")[1]) || DEFAULT_LIMIT;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();
  const { data: candidates, error } = await supabase
    .from("subscription_upload_sessions")
    .select("id,status,expires_at,object_path")
    .eq("status", UPLOAD_SESSION_STATUS_OPEN)
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(args.limit);

  if (error) throw error;

  const report = {
    mode: args.dryRun ? "dry-run" : "execute",
    candidates: (candidates || []).length,
    expired: 0,
    sample: (candidates || []).slice(0, 10).map((row) => row.id),
  };

  if (!args.dryRun && candidates?.length) {
    const ids = candidates.map((row) => row.id);
    const { data, error: updateError } = await supabase
      .from("subscription_upload_sessions")
      .update({
        status: UPLOAD_SESSION_STATUS_EXPIRED,
        updated_at: nowIso,
      })
      .in("id", ids)
      .eq("status", UPLOAD_SESSION_STATUS_OPEN)
      .select("id");

    if (updateError) throw updateError;
    report.expired = data?.length || 0;
  } else {
    report.expired = candidates?.length || 0;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Dry-run cleanup for orphan payment proof objects in Storage.
 * Orphans = objects under payment-proofs bucket not referenced by subscription_requests.payment_proof_path.
 *
 * SAFE DEFAULT: dry-run unless --execute is passed.
 * Do NOT run with --execute on production without review.
 *
 * Usage:
 *   node scripts/cleanup-payment-proof-orphans.js --dry-run --max-age-hours 24
 *   node scripts/cleanup-payment-proof-orphans.js --execute --max-age-hours 24 --limit 50
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { PAYMENT_PROOF_BUCKET } from "../lib/payment-proof-storage.js";

const DEFAULT_MAX_AGE_HOURS = 24;
const DEFAULT_LIMIT = 200;

function parseArgs(argv) {
  const args = {
    dryRun: true,
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
    limit: DEFAULT_LIMIT,
  };

  for (const arg of argv) {
    if (arg === "--execute") args.dryRun = false;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--max-age-hours=")) {
      args.maxAgeHours = Number(arg.split("=")[1]) || DEFAULT_MAX_AGE_HOURS;
    }
    if (arg.startsWith("--limit=")) {
      args.limit = Number(arg.split("=")[1]) || DEFAULT_LIMIT;
    }
  }

  return args;
}

function isOlderThan(isoOrMs, maxAgeHours) {
  if (!isoOrMs) return true;
  const ts = typeof isoOrMs === "number" ? isoOrMs : Date.parse(String(isoOrMs));
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts >= maxAgeHours * 60 * 60 * 1000;
}

async function listAllObjects(supabase, prefix = "") {
  const objects = [];
  const { data, error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).list(prefix, {
    limit: 1000,
  });
  if (error) throw error;

  for (const entry of data || []) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id == null && !entry.metadata) {
      const nested = await listAllObjects(supabase, entryPath);
      objects.push(...nested);
      continue;
    }
    objects.push({
      path: entryPath,
      updatedAt: entry.updated_at || entry.created_at || null,
    });
  }

  return objects;
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

  const { data: linkedRows, error: linkedError } = await supabase
    .from("subscription_requests")
    .select("payment_proof_path")
    .not("payment_proof_path", "is", null);

  if (linkedError) throw linkedError;

  const { data: sessionRows, error: sessionError } = await supabase
    .from("subscription_upload_sessions")
    .select("object_path")
    .not("object_path", "is", null);

  if (sessionError) throw sessionError;

  const linkedPaths = new Set(
    (linkedRows || [])
      .map((row) => String(row.payment_proof_path || "").trim())
      .filter(Boolean)
  );

  for (const row of sessionRows || []) {
    const path = String(row.object_path || "").trim();
    if (path) linkedPaths.add(path);
  }

  const objects = await listAllObjects(supabase);
  const candidates = objects
    .filter((item) => !linkedPaths.has(item.path))
    .filter((item) => isOlderThan(item.updatedAt, args.maxAgeHours))
    .slice(0, args.limit);

  const report = {
    mode: args.dryRun ? "dry-run" : "execute",
    maxAgeHours: args.maxAgeHours,
    linkedPaths: linkedPaths.size,
    scannedObjects: objects.length,
    orphanCandidates: candidates.length,
    deleted: 0,
    sample: candidates.slice(0, 10).map((item) => item.path),
  };

  if (!args.dryRun && candidates.length) {
    const paths = candidates.map((item) => item.path);
    const { error: removeError } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).remove(paths);
    if (removeError) throw removeError;
    report.deleted = paths.length;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

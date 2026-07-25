#!/usr/bin/env node
/**
 * Nullify legacy payment_proof text for rows already migrated to Storage.
 * Only touches rows with payment_proof_path set and verified object metadata.
 *
 * SAFE DEFAULT: dry-run unless --execute is passed.
 *
 * Usage:
 *   node scripts/nullify-migrated-payment-proofs.js --dry-run --limit 25
 *   node scripts/nullify-migrated-payment-proofs.js --execute --batch-size 10 --limit 100
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import {
  PAYMENT_PROOF_BUCKET,
  validatePaymentProofFileBuffer,
} from "../lib/payment-proof-storage.js";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LIMIT = 25;

function parseArgs(argv) {
  const args = {
    dryRun: true,
    batchSize: DEFAULT_BATCH_SIZE,
    limit: DEFAULT_LIMIT,
  };

  for (const arg of argv) {
    if (arg === "--execute") args.dryRun = false;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--batch-size=")) {
      args.batchSize = Number(arg.split("=")[1]) || DEFAULT_BATCH_SIZE;
    }
    if (arg.startsWith("--limit=")) {
      args.limit = Number(arg.split("=")[1]) || DEFAULT_LIMIT;
    }
  }

  return args;
}

async function verifyRowObject(supabase, row) {
  const objectPath = String(row.payment_proof_path || "").trim();
  if (!objectPath) return { ok: false, reason: "missing-path" };

  const { data, error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).download(objectPath);
  if (error) return { ok: false, reason: "missing-object" };

  const buffer = Buffer.from(await data.arrayBuffer());
  const validation = validatePaymentProofFileBuffer(buffer, {
    declaredMime: row.payment_proof_mime_type,
  });
  if (!validation.ok) return { ok: false, reason: validation.code || "invalid-object" };

  const expectedSize = Number(row.payment_proof_size_bytes || 0);
  if (expectedSize > 0 && validation.bytes !== expectedSize) {
    return { ok: false, reason: "size-mismatch" };
  }

  return { ok: true, bytes: validation.bytes, mime: validation.mime };
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

  const { data: rows, error } = await supabase
    .from("subscription_requests")
    .select(
      "id,payment_proof,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes"
    )
    .not("payment_proof_path", "is", null)
    .not("payment_proof", "is", null)
    .neq("payment_proof", "")
    .order("id", { ascending: true })
    .limit(Math.min(args.limit, args.batchSize));

  if (error) throw error;

  const report = {
    mode: args.dryRun ? "dry-run" : "execute",
    scanned: (rows || []).length,
    verified: 0,
    nullified: 0,
    skipped: [],
  };

  for (const row of rows || []) {
    const verification = await verifyRowObject(supabase, row);
    if (!verification.ok) {
      report.skipped.push({ id: row.id, reason: verification.reason });
      continue;
    }

    report.verified += 1;

    if (args.dryRun) {
      report.nullified += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("subscription_requests")
      .update({ payment_proof: null })
      .eq("id", row.id)
      .eq("payment_proof_path", row.payment_proof_path);

    if (updateError) {
      report.skipped.push({ id: row.id, reason: updateError.message || "update-failed" });
      continue;
    }

    report.nullified += 1;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Migrate legacy subscription_requests.payment_proof (data:image base64) to Supabase Storage.
 *
 * SAFE DEFAULTS: dry-run unless --execute is passed.
 * Does NOT delete or null payment_proof. Idempotent when payment_proof_path is set.
 *
 * Usage:
 *   node scripts/migrate-payment-proofs-to-storage.js --dry-run --limit 25
 *   node scripts/migrate-payment-proofs-to-storage.js --execute --batch-size 10 --limit 100
 *   node scripts/migrate-payment-proofs-to-storage.js --execute --resume-from-id 12345
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { decodeInlinePaymentProof } from "../lib/admin-payment-proof-response.js";
import {
  buildPaymentProofObjectPath,
  generatePaymentProofNonce,
} from "../lib/payment-proof-storage.js";

const BUCKET = "payment-proofs";
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LIMIT = 25;

function parseArgs(argv) {
  const args = {
    dryRun: true,
    batchSize: DEFAULT_BATCH_SIZE,
    limit: DEFAULT_LIMIT,
    resumeFromId: null,
  };

  for (const arg of argv) {
    if (arg === "--execute") args.dryRun = false;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--batch-size=")) args.batchSize = Number(arg.split("=")[1]) || DEFAULT_BATCH_SIZE;
    if (arg.startsWith("--limit=")) args.limit = Number(arg.split("=")[1]) || DEFAULT_LIMIT;
    if (arg.startsWith("--resume-from-id=")) args.resumeFromId = String(arg.split("=")[1] || "").trim();
  }

  return args;
}

function buildObjectPath({ userId, requestId, mimeType }) {
  assert.ok(userId, "userId required for storage path");
  assert.ok(requestId, "requestId required for storage path");
  const nonce = generatePaymentProofNonce();
  return buildPaymentProofObjectPath({ userId, sessionId: requestId, nonce, mimeType });
}

async function resolveUserIdForEmail(supabase, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

function isLegacyInlineProof(value) {
  return String(value || "").trim().startsWith("data:image/");
}

async function fetchLegacyBatch(supabase, { batchSize, limit, resumeFromId }) {
  let query = supabase
    .from("subscription_requests")
    .select("id,user_email,created_at,payment_proof,payment_proof_path")
    .is("payment_proof_path", null)
    .not("payment_proof", "is", null)
    .neq("payment_proof", "")
    .like("payment_proof", "data:image/%")
    .order("id", { ascending: true })
    .limit(Math.min(batchSize, limit));

  if (resumeFromId) {
    query = query.gt("id", resumeFromId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function migrateRow(supabase, row, { dryRun }) {
  const requestId = String(row.id);
  const legacyProof = String(row.payment_proof || "").trim();

  if (row.payment_proof_path) {
    return { status: "skipped", reason: "path-exists" };
  }

  if (!isLegacyInlineProof(legacyProof)) {
    return { status: "skipped", reason: "not-inline-data-url" };
  }

  let decoded;
  try {
    decoded = decodeInlinePaymentProof(legacyProof);
  } catch {
    return { status: "invalid", reason: "decode-failed" };
  }

  const userId = await resolveUserIdForEmail(supabase, row.user_email);
  if (!userId) {
    return { status: "failed", reason: "missing-profile-user-id" };
  }

  const objectPath = buildObjectPath({
    userId,
    requestId,
    mimeType: decoded.mimeType,
    uploadedAt: row.created_at,
  });

  if (dryRun) {
    return {
      status: "dry-run",
      objectPath,
      bytes: decoded.buffer.length,
      mimeType: decoded.mimeType,
    };
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, decoded.buffer, {
      contentType: decoded.mimeType,
      upsert: false,
    });

  if (uploadError) {
    return { status: "failed", reason: uploadError.message || "upload-failed" };
  }

  const { error: updateError } = await supabase
    .from("subscription_requests")
    .update({
      payment_proof_path: objectPath,
      payment_proof_mime_type: decoded.mimeType,
      payment_proof_size_bytes: decoded.buffer.length,
      payment_proof_uploaded_at: row.created_at || new Date().toISOString(),
      payment_proof_storage_provider: "supabase",
    })
    .eq("id", row.id)
    .is("payment_proof_path", null);

  if (updateError) {
    await supabase.storage.from(BUCKET).remove([objectPath]).catch(() => {});
    return { status: "failed", reason: updateError.message || "db-update-failed" };
  }

  return { status: "migrated", objectPath, bytes: decoded.buffer.length };
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

  const summary = {
    dryRun: args.dryRun,
    migrated: 0,
    skipped: 0,
    failed: 0,
    invalid: 0,
    dryRunPlanned: 0,
  };

  let resumeFromId = args.resumeFromId;
  let remaining = args.limit;

  while (remaining > 0) {
    const batch = await fetchLegacyBatch(supabase, {
      batchSize: args.batchSize,
      limit: remaining,
      resumeFromId,
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      const result = await migrateRow(supabase, row, { dryRun: args.dryRun });
      summary[result.status === "dry-run" ? "dryRunPlanned" : result.status] =
        (summary[result.status === "dry-run" ? "dryRunPlanned" : result.status] || 0) + 1;

      console.info("PAYMENT_PROOF_MIGRATE_ROW", {
        requestId: row.id,
        status: result.status,
        reason: result.reason || null,
        objectPath: result.objectPath || null,
        bytes: result.bytes || null,
      });
    }

    resumeFromId = String(batch[batch.length - 1].id);
    remaining -= batch.length;
  }

  console.info("PAYMENT_PROOF_MIGRATE_SUMMARY", summary);
}

main().catch((error) => {
  console.error("PAYMENT_PROOF_MIGRATE_FATAL", error?.message || error);
  process.exit(1);
});

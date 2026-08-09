#!/usr/bin/env node
/**
 * Historical withdrawal paid debits backfill — EXECUTE (Production-guarded).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "../../lib/production-env-guard.js";
import {
  buildWithdrawalBackfillIdempotencyKey,
  classifyLegacyWithdrawal,
} from "./backfill-withdrawals-dry-run.mjs";
import { loadManifest, validateManifestStructure } from "./backfill-unified-manifest.mjs";

const EXECUTE = process.argv.includes("--execute");
const manifestArg = process.argv.find((a) => a.startsWith("--manifest-file="));
const manifestFile = manifestArg?.split("=")[1]
  || process.argv[process.argv.indexOf("--manifest-file") + 1];

function abort(msg) {
  console.error(`ABORT: ${msg}`);
  process.exit(2);
}

function assertGuards() {
  if (!EXECUTE) abort("Missing --execute. Use backfill-withdrawals-dry-run.mjs for dry-run.");
  if (process.env.PARTNER_BACKFILL_CONFIRM_PRODUCTION !== PRODUCTION_SUPABASE_PROJECT_REF) {
    abort(`PARTNER_BACKFILL_CONFIRM_PRODUCTION must equal ${PRODUCTION_SUPABASE_PROJECT_REF}`);
  }
  if (!manifestFile) abort("Missing --manifest-file");
}

async function main() {
  assertGuards();
  const manifest = loadManifest(manifestFile);
  validateManifestStructure(manifest);
  const expectedHash = manifest.manifestSha256Expected;
  if (expectedHash && manifest.manifestSha256 !== expectedHash) {
    abort("MANIFEST_HASH_MISMATCH");
  }

  const approved = new Set((manifest.approvedWithdrawalDebitIds || []).map(String));
  if (!approved.size) abort("approvedWithdrawalDebitIds empty");

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) abort("Missing Supabase env");

  const service = createClient(url, key, { auth: { persistSession: false } });
  const { data: withdrawals, error } = await service
    .from("partner_withdrawals")
    .select("id, partner_id, amount, currency, status, created_at, paid_at")
    .eq("status", "paid")
    .order("created_at");

  if (error) abort(error.message);

  const candidates = (withdrawals || []).filter((w) => approved.has(String(w.id)));
  if (candidates.length !== approved.size) {
    abort(`Approved withdrawal count mismatch approved=${approved.size} found=${candidates.length}`);
  }

  let inserted = 0;
  for (const withdrawal of candidates) {
    const { data: existing } = await service
      .from("partner_financial_ledger_entries")
      .select("id, amount")
      .eq("legacy_withdrawal_id", withdrawal.id)
      .maybeSingle();

    const cls = classifyLegacyWithdrawal(withdrawal, existing);
    if (cls.status === "ALREADY_MAPPED") continue;
    if (cls.status !== "READY_TO_BACKFILL") abort(`Withdrawal ${withdrawal.id} status=${cls.status}`);

    const row = cls.suggestedRow;
    const { error: insErr } = await service.from("partner_financial_ledger_entries").insert({
      partner_id: withdrawal.partner_id,
      entry_type: row.entryType,
      entry_direction: row.entryDirection,
      lifecycle_status: row.lifecycleStatus,
      amount: withdrawal.amount,
      currency: withdrawal.currency || "USD",
      balance_bucket: row.balanceBucket,
      legacy_withdrawal_id: withdrawal.id,
      idempotency_key: buildWithdrawalBackfillIdempotencyKey(withdrawal.id),
      metadata: row.metadata,
      created_at: withdrawal.paid_at || withdrawal.created_at,
    });
    if (insErr?.code === "23505") continue;
    if (insErr) abort(insErr.message);
    inserted += 1;
  }

  console.log(JSON.stringify({ ok: true, inserted, approved: approved.size }, null, 2));
}

main();

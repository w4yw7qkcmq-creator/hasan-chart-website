#!/usr/bin/env node
/**
 * Historical partner_commissions backfill — EXECUTE (Production-guarded).
 *
 * Usage:
 *   PARTNER_BACKFILL_CONFIRM_PRODUCTION=lzgsxdsumnteuwtjfqlm \
 *   node scripts/partner-center/backfill-commissions-execute.mjs \
 *     --execute \
 *     --approved-ids-file scripts/partner-center/.artifacts/step3-approved-commission-ids.json
 *
 * NEVER run without --execute and production confirmation env var.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../../lib/production-env-guard.js";
import {
  buildBackfillLedgerRow,
  classifyLegacyCommission,
  dryRunBackfillCommissionsStaging,
} from "./backfill-commissions-dry-run.mjs";

const EXECUTE = process.argv.includes("--execute");
const idsFileArg = process.argv.find((a) => a.startsWith("--approved-ids-file="));
const idsFile = idsFileArg?.split("=")[1]
  || process.argv[process.argv.indexOf("--approved-ids-file") + 1];

function abort(message) {
  console.error(`ABORT: ${message}`);
  process.exit(2);
}

function assertProductionGuards() {
  if (!EXECUTE) {
    abort("Missing --execute flag. Dry-run only: use backfill-commissions-dry-run.mjs");
  }

  const confirm = String(process.env.PARTNER_BACKFILL_CONFIRM_PRODUCTION || "").trim();
  if (confirm !== PRODUCTION_SUPABASE_PROJECT_REF) {
    abort(
      `PARTNER_BACKFILL_CONFIRM_PRODUCTION must equal ${PRODUCTION_SUPABASE_PROJECT_REF}`
    );
  }

  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/i);
  const urlRef = refMatch?.[1] || "";
  if (urlRef && urlRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    abort(`Supabase URL ref ${urlRef} is not Production`);
  }

  if (!idsFile) {
    abort("Missing --approved-ids-file with explicit approved commission UUIDs");
  }
}

function loadApprovedIds() {
  const payload = JSON.parse(readFileSync(idsFile, "utf8"));
  const ids = Array.isArray(payload.approvedCommissionIds) ? payload.approvedCommissionIds : [];
  if (!ids.length) abort("approvedCommissionIds empty");
  return ids.map(String).sort();
}

async function insertBackfillRow(service, commission) {
  const row = buildBackfillLedgerRow(commission);
  const { data, error } = await service
    .from("partner_financial_ledger_entries")
    .insert({
      partner_id: commission.partner_id,
      entry_type: row.entryType,
      entry_direction: row.entryDirection,
      lifecycle_status: row.lifecycleStatus,
      amount: commission.amount,
      currency: commission.currency || "USD",
      balance_bucket: row.balanceBucket,
      legacy_commission_id: commission.id,
      idempotency_key: row.idempotencyKey,
      metadata: row.metadata,
      created_at: commission.created_at || undefined,
    })
    .select("id, idempotency_key, legacy_commission_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: true, duplicate: true, idempotencyKey: row.idempotencyKey };
    }
    throw error;
  }

  return { ok: true, duplicate: false, entryId: data.id, idempotencyKey: row.idempotencyKey };
}

export async function executeBackfillCommissions(service, { approvedIds }) {
  const approvedSet = new Set(approvedIds);
  const dryRun = await dryRunBackfillCommissionsStaging(service);
  const readyIds = dryRun.items
    .filter((item) => item.status === "READY_TO_BACKFILL")
    .map((item) => String(item.commissionId))
    .sort();

  if (readyIds.length !== approvedIds.length) {
    throw new Error(
      `READY count ${readyIds.length} != approved count ${approvedIds.length}`
    );
  }

  for (let i = 0; i < approvedIds.length; i += 1) {
    if (readyIds[i] !== approvedIds[i]) {
      throw new Error(
        `Approved ID mismatch at index ${i}: expected ${approvedIds[i]}, got ${readyIds[i]}`
      );
    }
  }

  const { data: commissions, error } = await service
    .from("partner_commissions")
    .select("id, partner_id, source_type, service_type, amount, currency, status, created_at")
    .in("id", approvedIds)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if ((commissions || []).length !== approvedIds.length) {
    throw new Error("Approved commission rows missing from database");
  }

  const summary = {
    mode: "execute",
    approvedCount: approvedIds.length,
    processed: 0,
    inserted: 0,
    duplicates: 0,
    failures: [],
  };

  for (const commission of commissions) {
    if (!approvedSet.has(String(commission.id))) {
      throw new Error(`Unexpected commission ${commission.id} outside approved set`);
    }

    const classification = classifyLegacyCommission(commission, null);
    if (classification.status !== "READY_TO_BACKFILL") {
      throw new Error(`Commission ${commission.id} not READY: ${classification.status}`);
    }

    try {
      const result = await insertBackfillRow(service, commission);
      summary.processed += 1;
      if (result.duplicate) summary.duplicates += 1;
      else summary.inserted += 1;
    } catch (err) {
      summary.failures.push({ commissionId: commission.id, reason: err.message });
      throw err;
    }
  }

  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertProductionGuards();
  const approvedIds = loadApprovedIds();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) abort("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const service = createClient(url, key, { auth: { persistSession: false } });
  const summary = await executeBackfillCommissions(service, { approvedIds });
  console.log(JSON.stringify(summary, null, 2));
}

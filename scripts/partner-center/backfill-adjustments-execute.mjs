#!/usr/bin/env node
/**
 * Historical adjustment backfill — EXECUTE stages 3/4/5 (Production-guarded).
 * Usage: --stage test-settlement|opening|special --execute --manifest-file ...
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "../../lib/production-env-guard.js";
import { loadManifest, validateManifestStructure } from "./backfill-unified-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXECUTE = process.argv.includes("--execute");
const stageArg = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1]
  || process.argv[process.argv.indexOf("--stage") + 1];
const manifestFile = process.argv.find((a) => a.startsWith("--manifest-file="))?.split("=")[1]
  || process.argv[process.argv.indexOf("--manifest-file") + 1]
  || resolve(__dirname, ".artifacts/step3b-unified-backfill-manifest.json");

function abort(msg) {
  console.error(`ABORT: ${msg}`);
  process.exit(2);
}

function loadEnvLocal() {
  for (const line of readFileSync(resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

async function resolvePartnerId(service, prefix) {
  const { data, error } = await service.from("partners").select("id");
  if (error) throw error;
  const match = (data || []).find((row) => String(row.id).startsWith(prefix));
  if (!match?.id) abort(`Partner not found for prefix ${prefix}`);
  return match.id;
}

async function insertAdjustment(service, spec) {
  const { data: existing } = await service
    .from("partner_financial_ledger_entries")
    .select("id")
    .eq("idempotency_key", spec.idempotencyKey)
    .maybeSingle();
  if (existing?.id) return { inserted: false, duplicate: true, idempotencyKey: spec.idempotencyKey };

  const metadata = {
    source: spec.metadataSource,
    backfill_version: "20260811",
    backfill_stage: spec.stage,
    ...(spec.extraMetadata || {}),
  };

  const { error } = await service.from("partner_financial_ledger_entries").insert({
    partner_id: spec.partnerId,
    entry_type: "manual_adjustment",
    entry_direction: "credit",
    lifecycle_status: "payable",
    amount: spec.amount,
    currency: "USD",
    balance_bucket: spec.bucket,
    idempotency_key: spec.idempotencyKey,
    metadata,
    created_at: spec.effectiveAt,
  });
  if (error?.code === "23505") return { inserted: false, duplicate: true, idempotencyKey: spec.idempotencyKey };
  if (error) throw error;
  return { inserted: true, duplicate: false, idempotencyKey: spec.idempotencyKey };
}

async function main() {
  if (!EXECUTE) abort("Missing --execute");
  if (!stageArg) abort("Missing --stage");
  if (process.env.PARTNER_BACKFILL_CONFIRM_PRODUCTION !== PRODUCTION_SUPABASE_PROJECT_REF) {
    abort(`PARTNER_BACKFILL_CONFIRM_PRODUCTION must equal ${PRODUCTION_SUPABASE_PROJECT_REF}`);
  }

  loadEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.includes(PRODUCTION_SUPABASE_PROJECT_REF)) abort("Supabase URL is not Production");
  if (!key) abort("Missing SUPABASE_SERVICE_ROLE_KEY");

  const manifest = loadManifest(manifestFile);
  validateManifestStructure(manifest);
  if (manifest.manifestSha256Expected && manifest.manifestSha256 !== manifest.manifestSha256Expected) {
    abort("MANIFEST_HASH_MISMATCH");
  }

  const service = createClient(url, key, { auth: { persistSession: false } });
  const summary = { stage: stageArg, inserted: 0, duplicates: 0, items: [] };

  if (stageArg === "test-settlement") {
    for (const adj of manifest.testSettlementAdjustments || []) {
      const partnerId = await resolvePartnerId(service, adj.partnerIdPrefix);
      const result = await insertAdjustment(service, {
        partnerId,
        amount: adj.amount,
        bucket: adj.bucket,
        idempotencyKey: adj.idempotencyKey,
        effectiveAt: adj.effectiveAt,
        metadataSource: "legacy_test_financial_settlement",
        stage: "test-settlement",
        extraMetadata: { reference_type: adj.referenceType, partner_id_prefix: adj.partnerIdPrefix },
      });
      summary.items.push(result);
      if (result.inserted) summary.inserted += 1;
      else if (result.duplicate) summary.duplicates += 1;
    }
    if (summary.inserted + summary.duplicates !== 3) abort(`Expected 3 test settlement entries, got ${summary.items.length}`);
  } else if (stageArg === "opening") {
    for (const adj of manifest.openingAdjustments || []) {
      const result = await insertAdjustment(service, {
        partnerId: adj.partnerId,
        amount: adj.amount,
        bucket: adj.bucket,
        idempotencyKey: adj.idempotencyKey,
        effectiveAt: adj.effectiveAt,
        metadataSource: "legacy_opening_balance",
        stage: "opening",
        extraMetadata: { evidence_class: adj.evidenceClass },
      });
      summary.items.push(result);
      if (result.inserted) summary.inserted += 1;
      else if (result.duplicate) summary.duplicates += 1;
    }
    if (summary.items.length !== 3) abort(`Expected 3 opening entries`);
  } else if (stageArg === "special") {
    const adj = (manifest.specialCaseAdjustments || [])[0];
    if (!adj) abort("No special case in manifest");
    const result = await insertAdjustment(service, {
      partnerId: adj.partnerId,
      amount: adj.amount,
      bucket: adj.bucket,
      idempotencyKey: adj.idempotencyKey,
      effectiveAt: adj.effectiveAt,
      metadataSource: adj.metadata?.source || "legacy_e2e_balance_fixture",
      stage: "special",
      extraMetadata: {
        ...adj.metadata,
        git_commit: adj.gitCommit,
        evidence_withdrawal_id: adj.evidenceWithdrawalId,
        resolution: adj.resolution,
      },
    });
    summary.items.push(result);
    if (result.inserted) summary.inserted += 1;
    else if (result.duplicate) summary.duplicates += 1;
  } else {
    abort(`Unknown stage ${stageArg}`);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  abort(err?.message || String(err));
});

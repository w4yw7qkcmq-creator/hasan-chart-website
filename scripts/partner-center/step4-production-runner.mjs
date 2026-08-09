#!/usr/bin/env node
/**
 * Production backfill preflight + reconciliation (read-only except stage runners invoke writes).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTION_SUPABASE_PROJECT_REF, assertProductionSupabaseConfig } from "../../lib/production-env-guard.js";
import { loadManifest, validateManifestStructure } from "./backfill-unified-manifest.mjs";
import { dryRunBackfillCommissionsStaging } from "./backfill-commissions-dry-run.mjs";
import { dryRunBackfillWithdrawals } from "./backfill-withdrawals-dry-run.mjs";
import { roundMoney } from "../../lib/partner-center/money.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(__dirname, ".artifacts/step3b-unified-backfill-manifest.json");
const APPROVED_HASH = "f2bec6b4db9ce2ffc044ddb1b5874dfdd7458c2f10e09fdddc779f007b286238";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  } catch { /* optional */ }
}

function serviceClient() {
  loadEnvLocal();
  assertProductionSupabaseConfig({
    projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing production Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function sumBucket(rows, bucket) {
  let t = 0;
  for (const r of rows) {
    const a = Number(r.amount || 0);
    const s = r.entry_direction === "debit" ? -a : a;
    if (r.balance_bucket === bucket) t += s;
  }
  return roundMoney(t);
}

export async function preflight(service) {
  const manifest = loadManifest(MANIFEST);
  validateManifestStructure(manifest);
  if (manifest.manifestSha256 !== APPROVED_HASH) {
    throw new Error(`MANIFEST_HASH_MISMATCH got=${manifest.manifestSha256}`);
  }

  const [{ count: commissions }, { count: withdrawals }, { count: wallet }, { count: ledger }] = await Promise.all([
    service.from("partner_commissions").select("*", { count: "exact", head: true }),
    service.from("partner_withdrawals").select("*", { count: "exact", head: true }),
    service.from("partner_wallet_ledger").select("*", { count: "exact", head: true }),
    service.from("partner_financial_ledger_entries").select("*", { count: "exact", head: true }),
  ]);

  const { count: paidWithdrawals } = await service
    .from("partner_withdrawals")
    .select("*", { count: "exact", head: true })
    .eq("status", "paid");

  const { data: partners } = await service
    .from("partners")
    .select("id, balance_pending, balance_bonus_pending, balance_withdrawable, total_earnings, total_withdrawn")
    .order("created_at");

  const commDry = await dryRunBackfillCommissionsStaging(service);

  return {
    manifestSha256: manifest.manifestSha256,
    counts: { commissions, withdrawals, paidWithdrawals, wallet, ledger },
    partners: (partners || []).map((p) => ({
      idPrefix: String(p.id).slice(0, 8),
      balance_pending: p.balance_pending,
      balance_bonus_pending: p.balance_bonus_pending,
      balance_withdrawable: p.balance_withdrawable,
      total_earnings: p.total_earnings,
      total_withdrawn: p.total_withdrawn,
    })),
    commissionDryRun: commDry.counts,
  };
}

export async function reconcileAll(service) {
  const { data: partners } = await service.from("partners").select("id, balance_pending, balance_bonus_pending, balance_withdrawable").order("created_at");
  const reports = [];
  for (const p of partners || []) {
    const { data: ledger } = await service
      .from("partner_financial_ledger_entries")
      .select("entry_direction, amount, balance_bucket")
      .eq("partner_id", p.id);
    const derived = {
      pending: sumBucket(ledger || [], "pending"),
      bonusPending: sumBucket(ledger || [], "bonus_pending"),
      withdrawable: sumBucket(ledger || [], "withdrawable"),
    };
    const legacy = {
      pending: roundMoney(p.balance_pending),
      bonusPending: roundMoney(p.balance_bonus_pending),
      withdrawable: roundMoney(p.balance_withdrawable),
    };
    const match = derived.pending === legacy.pending && derived.bonusPending === legacy.bonusPending && derived.withdrawable === legacy.withdrawable;
    reports.push({ partnerPrefix: String(p.id).slice(0, 8), match, legacy, derived, ledgerCount: (ledger || []).length });
  }
  return {
    MATCH: reports.filter((r) => r.match).length,
    DIFFERENCE: reports.filter((r) => !r.match).length,
    reports,
  };
}

export async function ledgerBreakdown(service) {
  const { data: rows } = await service.from("partner_financial_ledger_entries").select("entry_type, entry_direction, balance_bucket, amount");
  const counts = {};
  for (const r of rows || []) {
    const k = `${r.entry_type}:${r.entry_direction}:${r.balance_bucket}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return { total: (rows || []).length, counts, rows: rows || [] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || "preflight";
  const service = serviceClient();
  if (cmd === "preflight") {
    const out = await preflight(service);
    mkdirSync(resolve(__dirname, ".artifacts"), { recursive: true });
    writeFileSync(resolve(__dirname, ".artifacts/step4-pre-execution-snapshot.json"), JSON.stringify({ capturedAt: new Date().toISOString(), ...out }, null, 2));
    console.log(JSON.stringify(out, null, 2));
  } else if (cmd === "reconcile") {
    console.log(JSON.stringify(await reconcileAll(service), null, 2));
  } else if (cmd === "ledger") {
    console.log(JSON.stringify(await ledgerBreakdown(service), null, 2));
  } else {
    console.error("Usage: step4-production-runner.mjs [preflight|reconcile|ledger]");
    process.exit(2);
  }
}

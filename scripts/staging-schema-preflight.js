#!/usr/bin/env node
/**
 * Staging schema preflight — read-only checks against Staging Supabase.
 * Requires .env.staging.local and staging guard passing.
 */

import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import { maskProjectRef } from "../lib/staging-env-guard.js";

const REQUIRED_TABLES = [
  "subscription_requests",
  "profiles",
  "partners",
  "partner_commissions",
  "partner_withdrawals",
  "partner_wallet_ledger",
  "admin_logs",
];

const RPC_COLUMN_CHECKS = {
  admin_logs: ["admin_id", "admin_email", "action", "target_table", "target_id", "details"],
  partner_wallet_ledger: [
    "partner_id",
    "type",
    "amount",
    "balance_before",
    "balance_after",
    "reference_type",
    "reference_id",
    "note",
  ],
  partner_commissions: ["status", "is_withdrawable", "reason", "description", "amount", "partner_id"],
  partner_withdrawals: ["status", "amount", "wallet_address", "payment_proof", "admin_note", "partner_note"],
  partners: [
    "balance_withdrawable",
    "balance_pending",
    "total_earnings",
    "total_withdrawn",
    "user_id",
  ],
  subscription_requests: ["id", "user_email"],
  profiles: ["id", "email"],
};

async function main() {
  const staging = loadStagingEnvFile();
  const url = process.env.STAGING_SUPABASE_URL;
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report = {
    environment: "staging",
    projectRefMasked: maskProjectRef(staging.projectRef),
    tables: {},
    rpcFunction: null,
    indexPresent: null,
    blockers: [],
  };

  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
    report.tables[table] = {
      exists: !error,
      error: error?.message || null,
    };
    if (error) report.blockers.push({ code: "TABLE_MISSING", table, message: error.message });
  }

  for (const [table, columns] of Object.entries(RPC_COLUMN_CHECKS)) {
    if (!report.tables[table]?.exists) continue;
    const { error } = await supabase.from(table).select(columns.join(",")).limit(0);
    report.tables[table] = {
      ...report.tables[table],
      columnsOk: !error,
      columnsError: error?.message || null,
    };
    if (error) {
      report.blockers.push({ code: "COLUMN_MISSING", table, message: error.message });
    }
  }

  const { data: rpcProbe, error: rpcError } = await supabase.rpc("settle_test_partner_financial", {
    p_partner_id: "00000000-0000-0000-0000-000000000001",
    p_commission_id: "00000000-0000-0000-0000-000000000002",
    p_withdrawal_id: "00000000-0000-0000-0000-000000000003",
    p_request_id: 1,
    p_idempotency_key:
      "test-financial-settlement:1:00000000-0000-0000-0000-000000000002:00000000-0000-0000-0000-000000000003",
  });

  if (rpcError?.code === "PGRST202") {
    report.rpcFunction = { exists: false, error: rpcError.message };
    report.blockers.push({ code: "RPC_MISSING", message: rpcError.message });
  } else {
    report.rpcFunction = {
      exists: true,
      probeCode: rpcError?.code || null,
      probeMessage: rpcError?.message || null,
    };
  }

  const { count: settlementRefCount } = await supabase
    .from("partner_wallet_ledger")
    .select("*", { count: "exact", head: true })
    .eq("reference_type", "test_financial_settlement");

  report.existingSettlementAdjustments = settlementRefCount ?? 0;

  report.ok = report.blockers.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error("STAGING_PREFLIGHT_FAILED", {
    message: error.message,
    code: error.code || null,
  });
  process.exit(1);
});

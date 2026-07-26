#!/usr/bin/env node
/**
 * Dry-run financial settlement audit for test partner commissions.
 * Read-only — no DB mutations, no --execute support.
 *
 * Usage:
 *   node scripts/audit-test-partner-financial-settlement.js --request-ids=44,45,46
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import {
  formatSettlementAuditSummary,
  parseSettlementAuditArgs,
  runFinancialSettlementAudit,
} from "../lib/audit-test-partner-financial-settlement.js";

function logEvent(event, payload) {
  console.info(event, payload);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const args = parseSettlementAuditArgs(process.argv.slice(2));
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const plan = await runFinancialSettlementAudit(supabase, {
      requestIds: args.requestIds,
    });
    console.info("FINANCIAL_SETTLEMENT_AUDIT", JSON.stringify(formatSettlementAuditSummary(plan), null, 2));
    if (!plan.canSettleAllAutomatically) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error("FINANCIAL_SETTLEMENT_AUDIT_FAILED", {
      message: error.message || String(error),
      code: error.code || null,
    });
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

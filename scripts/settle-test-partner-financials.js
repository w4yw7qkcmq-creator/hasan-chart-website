#!/usr/bin/env node
/**
 * E2E test partner financial settlement.
 * SAFE DEFAULT: dry-run unless --execute is passed explicitly.
 *
 * Usage:
 *   node scripts/settle-test-partner-financials.js --request-ids=44,45,46
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import {
  parseSettleTestPartnerFinancialsArgs,
  runSettleTestPartnerFinancials,
} from "../lib/settle-test-partner-financials.js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const args = parseSettleTestPartnerFinancialsArgs(process.argv.slice(2));
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const report = await runSettleTestPartnerFinancials(supabase, {
      requestIds: args.requestIds,
      execute: args.execute,
    });
    console.info("SETTLE_TEST_PARTNER_FINANCIALS", JSON.stringify(report, null, 2));
    if (!report.canExecuteAll && !args.execute) {
      const unsettled = (report.entries || []).filter((entry) => !entry.canExecute && !entry.alreadySettled);
      if (unsettled.length) process.exitCode = 2;
    }
  } catch (error) {
    console.error("SETTLE_TEST_PARTNER_FINANCIALS_FAILED", {
      message: error.message || String(error),
      code: error.code || null,
      blockers: error.blockers || null,
    });
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

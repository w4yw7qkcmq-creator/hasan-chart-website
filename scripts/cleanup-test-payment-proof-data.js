#!/usr/bin/env node
/**
 * Production cleanup for test payment-proof subscription data.
 *
 * SAFE DEFAULT: dry-run unless --execute is passed explicitly.
 *
 * Usage:
 *   node scripts/cleanup-test-payment-proof-data.js --request-ids=33,34,35,41,42,43,44,45,46,54,55,56
 *   node scripts/cleanup-test-payment-proof-data.js --execute --request-ids=33,34,...
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { runCleanupTestPaymentProofData } from "../lib/cleanup-test-payment-proof-runner.js";

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

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const plan = await runCleanupTestPaymentProofData({
      supabase,
      argv: process.argv.slice(2),
    });
    logEvent("CLEANUP_TEST_PAYMENT_PROOF_PLAN", plan);
    if (!plan.canExecute) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error("CLEANUP_TEST_PAYMENT_PROOF_FAILED", {
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

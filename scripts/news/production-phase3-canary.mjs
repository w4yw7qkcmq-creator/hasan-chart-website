#!/usr/bin/env node
/**
 * Production Phase 3 canary — safe noop/diagnostic checks only.
 * Usage: node scripts/news/production-phase3-canary.mjs
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.chdir(path.join(__dirname, "..", ".."));

const { getPhase2RuntimeConfig } = require("../../worker/lib/news-intelligence/economic-editorial/integration");
const { getPhase3RuntimeConfig } = require("../../worker/lib/news-intelligence/autonomy/feature-flags");
const { getNewsSystemStatus } = require("../../worker/lib/news-intelligence/autonomy/diagnostic-service");
const { runAllGoldenFixtures, REPLAY_MODES } = require("../../worker/lib/news-intelligence/autonomy/replay-harness");
const { openOrUpdateIncident, getOpenIncidents } = require("../../worker/lib/news-intelligence/autonomy/incident-engine");
const { flushObservability } = require("../../worker/lib/news-intelligence/autonomy/decision-persistence");
const { recordDecision } = require("../../worker/lib/news-intelligence/autonomy/decision-record");

async function main() {
  const runtime = {
    phase2: getPhase2RuntimeConfig(),
    phase3: getPhase3RuntimeConfig(),
  };
  console.log("PHASE3_CANARY_RUNTIME", JSON.stringify(runtime));

  recordDecision({
    correlationId: "CANARY-DECISION-PHASE3",
    reasonCode: "PUBLISHED",
    sourceType: "canary",
    sourceId: "CANARY_PHASE3",
    metadata: { canary: true },
  });

  const first = openOrUpdateIncident({
    type: "WORKER_STABILITY_ANOMALY",
    severity: "INFO",
    affectedSource: "CANARY_PHASE3",
    signature: "canary-phase3-dedupe",
    evidenceSummary: { canary: true },
  });
  const second = openOrUpdateIncident({
    type: "WORKER_STABILITY_ANOMALY",
    severity: "INFO",
    affectedSource: "CANARY_PHASE3",
    signature: "canary-phase3-dedupe",
    evidenceSummary: { canary: true },
  });
  if (first.incidentId !== second.incidentId || second.count < 2) {
    throw new Error("incident dedupe canary failed");
  }

  const golden = await runAllGoldenFixtures({ mode: REPLAY_MODES.REPLAY_DRY_RUN, enablePhase2Editorial: true });
  if (golden.loadedFixtures !== 20 || golden.executedFixtures !== 20) {
    throw new Error(`golden canary expected 20/20, got ${golden.loadedFixtures}/${golden.executedFixtures}`);
  }

  let supabase = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const flush = await flushObservability(supabase);
    console.log("PHASE3_CANARY_DB_FLUSH", JSON.stringify(flush));
  }

  console.log("PHASE3_CANARY_STATUS", JSON.stringify(getNewsSystemStatus()));
  console.log("PHASE3_CANARY_OPEN_INCIDENTS", getOpenIncidents().length);
  console.log("production-phase3-canary.mjs: PASS");
}

main().catch((error) => {
  console.error("production-phase3-canary.mjs FAIL", error);
  process.exit(1);
});

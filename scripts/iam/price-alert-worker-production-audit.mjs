#!/usr/bin/env node
/**
 * Production read-only audit — Price Alerts Worker (masked output).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
  assertProductionSupabaseConfig,
} from "../../lib/production-env-guard.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { classifyHistoricalIntegrity } = require("../../worker/lib/price-alert-integrity-classifier.js");

const ARTIFACT_DIR = join(process.cwd(), "scripts/alerts/.artifacts");

function maskEmail(email) {
  const value = String(email || "").trim();
  if (!value.includes("@")) return "***";
  const [local, domain] = value.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskId(id) {
  const value = String(id || "");
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

async function main() {
  assertProductionSupabaseConfig();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = createClient(url, key, { auth: { persistSession: false } });

  const { count: activeCount } = await client
    .from("price_alerts")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { count: triggeredCount } = await client
    .from("price_alerts")
    .select("id", { count: "exact", head: true })
    .eq("status", "triggered");

  const { data: triggeredSample } = await client
    .from("price_alerts")
    .select("id, user_email, status, triggered_at, email_sent_at")
    .eq("status", "triggered")
    .order("triggered_at", { ascending: false })
    .limit(200);

  const { data: deliveryAttempts, error: deliveryError } = await client
    .from("price_alert_delivery_attempts")
    .select("alert_id, channel, status")
    .limit(500);

  const integrity = classifyHistoricalIntegrity({
    triggeredAlerts: triggeredSample || [],
    deliveryAttempts: deliveryError ? [] : deliveryAttempts || [],
  });

  const report = {
    timestamp: new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z",
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    ok: integrity.unknownCount === 0,
    counts: {
      activeAlerts: activeCount ?? 0,
      triggeredAlerts: triggeredCount ?? 0,
      deliveryAttemptRows: deliveryAttempts?.length ?? 0,
    },
    classification: integrity.table,
    unknownCount: integrity.unknownCount,
    findings: integrity.findings.slice(0, 20).map((row) => ({
      alertIdMasked: maskId(row.alertId),
      emailMasked: maskEmail(row.email),
      classification: row.classification,
      reason: row.reason,
    })),
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = join(ARTIFACT_DIR, `price-alerts-audit-${report.timestamp}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, file, unknownCount: report.unknownCount }));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

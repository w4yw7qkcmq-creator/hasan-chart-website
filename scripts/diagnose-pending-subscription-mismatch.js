import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getAdminStatusKey, getAdminStatusLabel, formatSubscriptionRequest } from "../app/(app)/admin/admin-dashboard-helpers.js";
import { isPendingAdminStatus } from "../lib/admin-status-constants.js";
import {
  getPendingSubscriptionDiagnostic,
  rowHasSubscriptionRequestProof,
} from "../lib/admin-pending-subscription-request.js";
import { matchesSubscriptionStatusFilter } from "../app/(app)/admin/admin-dashboard-helpers.js";

function loadEnv() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: rows, error } = await supabase
  .from("subscription_requests")
  .select(
    "id,status,plan_name,admin_disabled,expires_at,payment_proof_path,payment_proof,created_at"
  )
  .order("created_at", { ascending: false })
  .limit(20);

if (error) {
  console.error(error);
  process.exit(1);
}

function diagnoseRow(dbRow) {
  const enriched = {
    ...dbRow,
    has_payment_proof:
      Boolean(String(dbRow?.payment_proof_path || "").trim()) ||
      Boolean(String(dbRow?.payment_proof || "").trim()),
  };
  const formatted = formatSubscriptionRequest(enriched);
  const statusKey = getAdminStatusKey(dbRow.status);
  const label = getAdminStatusLabel(dbRow.status);
  const dbDiagnostic = getPendingSubscriptionDiagnostic(dbRow);
  const formattedDiagnostic = getPendingSubscriptionDiagnostic(formatted);

  return {
    requestId: dbRow.id,
    db: {
      rawStatus: String(dbRow.status || "").trim() || "(empty)",
      getAdminStatusKey: statusKey,
      formattedStatusLabel: label,
      isPendingAdminStatus: isPendingAdminStatus(dbRow.status),
      isPendingSubscriptionRequestRow: dbDiagnostic.isPending,
      has_payment_proof: enriched.has_payment_proof,
      payment_proof_path: Boolean(String(dbRow.payment_proof_path || "").trim()),
      legacy_payment_proof: Boolean(String(dbRow.payment_proof || "").trim()),
      admin_disabled: Boolean(dbRow.admin_disabled),
      expires_at: dbRow.expires_at,
      plan_name: dbRow.plan_name || "",
      diagnostic: dbDiagnostic,
    },
    formatted: {
      status: formatted.status,
      isPendingSubscriptionRequestRow: formattedDiagnostic.isPending,
      hasPaymentProof: formatted.hasPaymentProof,
      paymentProofPath: Boolean(String(formatted.paymentProofPath || "").trim()),
      adminDisabled: formatted.adminDisabled,
      matchesPendingFilter: matchesSubscriptionStatusFilter(formatted, "pending"),
      diagnostic: formattedDiagnostic,
    },
    visibleAsPendingCard: statusKey === "pending" || label === "بانتظار المراجعة",
  };
}

const legacyIds = new Set([8, 9, 11, 12]);
const diagnosed = (rows || []).map(diagnoseRow);
const visiblePending = diagnosed.filter((row) => row.visibleAsPendingCard);
const helperPendingDb = diagnosed.filter((row) => row.db.isPendingSubscriptionRequestRow);
const helperPendingFormatted = diagnosed.filter((row) => row.formatted.isPendingSubscriptionRequestRow);

console.log(
  JSON.stringify(
    {
      summary: {
        loadedRows: diagnosed.length,
        visibleAsPendingCard: visiblePending.length,
        helperPendingDb: helperPendingDb.length,
        helperPendingFormatted: helperPendingFormatted.length,
      },
      visiblePendingCards: visiblePending,
      legacyRows: diagnosed.filter((row) => legacyIds.has(Number(row.requestId))),
      mismatchRows: visiblePending.filter((row) => !row.formatted.isPendingSubscriptionRequestRow),
    },
    null,
    2
  )
);

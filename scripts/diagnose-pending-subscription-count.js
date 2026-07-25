import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PENDING_ADMIN_DB_STATUSES } from "../lib/admin-status-constants.js";
import {
  countPendingSubscriptionRequestRows,
  explainPendingSubscriptionRequestRow,
  filterPendingSubscriptionRequestRows,
} from "../lib/admin-pending-subscription-request.js";
import { countPendingPaymentReviewRows } from "../lib/financial-center/pending-payment-review.js";

function loadEnv() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
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

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows, error } = await supabase
  .from("subscription_requests")
  .select("id,status,created_at,admin_disabled,payment_proof_path,payment_proof")
  .order("created_at", { ascending: false });

if (error) {
  console.error(error);
  process.exit(1);
}

const allRows = rows || [];
const hubLegacyPending = allRows.filter((row) =>
  PENDING_ADMIN_DB_STATUSES.includes(String(row.status || "").trim())
);
const subscriptionPending = filterPendingSubscriptionRequestRows(allRows);
const paymentReviewPending = allRows.filter((row) =>
  countPendingPaymentReviewRows([row]) === 1
);

const extraRows = hubLegacyPending
  .filter((row) => !subscriptionPending.some((item) => item.id === row.id))
  .map((row) => {
    const explanation = explainPendingSubscriptionRequestRow(row);
    return {
      requestId: row.id,
      rawStatus: String(row.status || "").trim() || "(empty)",
      hasPaymentProof: Boolean(String(row.payment_proof_path || "").trim() || String(row.payment_proof || "").trim()),
      admin_disabled: Boolean(row.admin_disabled),
      created_at: row.created_at,
      hubReason: "matches PENDING_ADMIN_DB_STATUSES",
      tabReason: explanation.reason,
    };
  });

console.log(
  JSON.stringify(
    {
      totals: {
        hubLegacyPending: hubLegacyPending.length,
        subscriptionPending: subscriptionPending.length,
        paymentReviewPending: paymentReviewPending.length,
      },
      subscriptionPendingIds: subscriptionPending.map((row) => row.id),
      extraRowsExcludedFromSubscriptionPending: extraRows,
    },
    null,
    2
  )
);

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { enrichSubscriptionRequestsWithTimeline } from "../lib/admin-subscription-request-timeline.js";

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

console.log("=== STEP 1: subscription_requests ===");
const { data: rows, error: rowsError } = await supabase
  .from("subscription_requests")
  .select(
    "id,user_email,username,plan_name,category,price,telegram_username,payment_proof,status,started_at,expires_at,created_at"
  )
  .order("created_at", { ascending: false })
  .limit(20);

if (rowsError) {
  console.error("subscription_requests FAILED");
  console.error(rowsError);
  process.exit(1);
}

console.log("subscription_requests OK:", rows?.length ?? 0);

console.log("=== STEP 2: admin_logs probe ===");
const ids = (rows || []).map((row) => String(row.id)).filter(Boolean);
const { data: logs, error: logsError } = await supabase
  .from("admin_logs")
  .select("id,action,target_id,target_table,admin_email,details,created_at")
  .eq("target_table", "subscription_requests")
  .in("target_id", ids)
  .order("created_at", { ascending: true });

if (logsError) {
  console.error("admin_logs FAILED");
  console.error("code:", logsError.code);
  console.error("message:", logsError.message);
  console.error("details:", logsError.details);
  console.error("hint:", logsError.hint);
} else {
  console.log("admin_logs OK:", logs?.length ?? 0);
}

console.log("=== STEP 3: enrichSubscriptionRequestsWithTimeline ===");
try {
  const enriched = await enrichSubscriptionRequestsWithTimeline(supabase, rows || []);
  console.log("enrich OK:", enriched.length);
} catch (error) {
  console.error("enrich FAILED");
  console.error("name:", error?.name);
  console.error("message:", error?.message);
  console.error("stack:\n", error?.stack);
  process.exit(1);
}

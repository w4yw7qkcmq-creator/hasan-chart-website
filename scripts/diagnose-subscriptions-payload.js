import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { enrichSubscriptionRequestsWithTimeline } from "../lib/admin-subscription-request-timeline.js";

const SUBSCRIPTION_LIST_SELECT_FIELDS =
  "id,user_email,username,plan_name,category,price,telegram_username,status,started_at,expires_at,created_at";

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const t0 = Date.now();
const { data, error } = await supabase
  .from("subscription_requests")
  .select(SUBSCRIPTION_LIST_SELECT_FIELDS)
  .order("created_at", { ascending: false })
  .limit(20);

const fetchMs = Date.now() - t0;
if (error) {
  console.error(error);
  process.exit(1);
}

const rowsForEnrichment = (data || []).map((row) => ({
  ...row,
  has_payment_proof: true,
}));

const t1 = Date.now();
const enriched = await enrichSubscriptionRequestsWithTimeline(supabase, rowsForEnrichment);
const enrichMs = Date.now() - t1;

const json = JSON.stringify({ success: true, subscription_requests: enriched });

console.log(
  JSON.stringify(
    {
      fetchMs,
      enrichMs,
      totalMs: fetchMs + enrichMs,
      rows: data?.length ?? 0,
      jsonBytes: json.length,
      selectIncludesPaymentProof: SUBSCRIPTION_LIST_SELECT_FIELDS.includes("payment_proof"),
      sampleHasPaymentProofField: Object.prototype.hasOwnProperty.call(data?.[0] || {}, "payment_proof"),
    },
    null,
    2
  )
);

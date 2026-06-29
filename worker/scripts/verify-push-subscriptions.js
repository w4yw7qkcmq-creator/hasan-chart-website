require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });

const { createClient } = require("@supabase/supabase-js");
const { getVapidEnvStatus } = require("../push-vapid-env");
const { sendPriceAlertPushNotifications } = require("../push-sender");

async function main() {
  const email = String(process.env.PRICE_ALERT_TEST_EMAIL || process.argv[2] || "")
    .trim()
    .toLowerCase();

  if (!email) {
    throw new Error("Usage: PRICE_ALERT_TEST_EMAIL=user@example.com node scripts/verify-push-subscriptions.js");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const vapidStatus = getVapidEnvStatus();
  console.log("push:vapid:status", vapidStatus);

  const { data: emailRows, error } = await supabase
    .from("push_subscriptions")
    .select("id, email, user_id, anonymous_id, endpoint, p256dh, auth, created_at, updated_at")
    .eq("email", email)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = emailRows || [];

  if (rows.length === 0) {
    const { data: ilikeRows, error: ilikeError } = await supabase
      .from("push_subscriptions")
      .select("id, email, user_id, anonymous_id, endpoint, p256dh, auth, created_at, updated_at")
      .ilike("email", email)
      .order("updated_at", { ascending: false });

    if (ilikeError) {
      throw new Error(ilikeError.message);
    }

    rows.push(...(ilikeRows || []));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  let userRows = [];

  if (profile?.id) {
    const { data, error: userRowsError } = await supabase
      .from("push_subscriptions")
      .select("id, email, user_id, anonymous_id, endpoint, p256dh, auth, created_at, updated_at")
      .eq("user_id", profile.id);

    if (userRowsError) {
      throw new Error(userRowsError.message);
    }

    userRows = data || [];
  }

  const merged = new Map();

  for (const row of [...(rows || []), ...userRows]) {
    if (row?.id) merged.set(row.id, row);
  }

  const subscriptions = [...merged.values()];

  if (subscriptions.length === 0) {
    console.log("push:subscription:not_found", {
      email,
      userId: profile?.id || null,
      reason: "NO_ROWS_FOR_EMAIL",
      hint: "Re-open the site while logged in and click enable browser notifications again",
    });
    process.exitCode = 1;
    return;
  }

  console.log("push:subscription:found", {
    email,
    userId: profile?.id || null,
    count: subscriptions.length,
    subscriptions: subscriptions.map((row) => ({
      id: row.id,
      email: row.email,
      user_id: row.user_id,
      anonymous_id: row.anonymous_id,
      endpointPrefix: String(row.endpoint || "").slice(0, 72),
      hasP256dh: Boolean(row.p256dh),
      hasAuth: Boolean(row.auth),
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  });

  if (!vapidStatus.configured) {
    console.log("push:vapid:missing", vapidStatus);
    process.exitCode = 1;
    return;
  }

  const stats = await sendPriceAlertPushNotifications({
    supabase,
    workerEntry: "worker/scripts/verify-push-subscriptions.js",
    alertId: `verify-${Date.now()}`,
    email,
    userId: profile?.id || null,
    title: "🔔 اختبار Web Push - HasaN CharT",
    body: "إذا ظهر هذا الإشعار، Web Push يعمل بنجاح.",
    url: "https://www.hasanchartworld.com/alerts",
  });

  console.log("push:verify:result", stats);

  if ((stats?.sent || 0) < 1) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("verify-push-subscriptions: FAILED", error?.message || error);
  process.exit(1);
});

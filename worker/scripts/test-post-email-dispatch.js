require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });

const { createClient } = require("@supabase/supabase-js");
const { buildPriceAlertEmailPayload, PRICE_ALERT_FROM } = require("../price-alert-email");
const { createUserNotification } = require("../create-user-notification");
const { sendPriceAlertPushNotifications, isWebPushConfigured } = require("../push-sender");

const EXPECTED_FROM = "HasaN CharT Alerts <alerts@hasanchartworld.com>";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const testEmail = String(process.env.PRICE_ALERT_TEST_EMAIL || "").trim().toLowerCase();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert(testEmail, "Missing PRICE_ALERT_TEST_EMAIL");
  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(serviceRoleKey, "Missing SUPABASE_SERVICE_ROLE_KEY");

  const payload = buildPriceAlertEmailPayload({
    email: testEmail,
    coinLabel: "BTC-USDT",
    conditionLabel: "وصول السعر للأعلى",
    targetPrice: "65000",
    currentPrice: "65012.45",
    alertId: "dispatch-test",
  });

  assert(payload.from === EXPECTED_FROM, `Unexpected sender: ${payload.from}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: notificationRow, error: notificationError } = await createUserNotification(
    supabase,
    {
      userEmail: testEmail,
      title: "🔔 وصل السعر إلى هدف التنبيه",
      message: "اختبار dispatch بعد الإيميل",
      type: "price-alert",
    }
  );

  if (notificationError) {
    throw new Error(`Site notification insert failed: ${notificationError.message}`);
  }

  console.log("alert:site-notification:created", {
    notificationId: notificationRow?.id || null,
    email: testEmail,
    type: "price-alert",
  });

  const pushStats = await sendPriceAlertPushNotifications({
    supabase,
    workerEntry: "worker/scripts/test-post-email-dispatch.js",
    alertId: "dispatch-test",
    email: testEmail,
    userId: null,
    title: "🔔 وصل السعر إلى هدف التنبيه",
    body: "اختبار push بعد الإيميل",
    url: "https://www.hasanchartworld.com/alerts",
  });

  if ((pushStats?.sent || 0) > 0) {
    console.log("alert:push:sent", pushStats);
  } else if ((pushStats?.skipped || 0) > 0) {
    console.log("alert:push:skipped", {
      reason: pushStats.skipReason || "PUSH_SKIPPED",
      webPushConfigured: isWebPushConfigured(),
      ...pushStats,
    });
  } else {
    console.log("alert:notification:error", pushStats);
  }

  console.log("test-post-email-dispatch: OK");
}

main().catch((error) => {
  console.error("test-post-email-dispatch: FAILED", error?.message || error);
  process.exit(1);
});

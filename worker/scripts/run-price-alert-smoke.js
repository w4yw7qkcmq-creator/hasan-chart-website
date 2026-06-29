require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });

const { createClient } = require("@supabase/supabase-js");

const EXPECTED_FROM = "HasaN CharT Alerts <alerts@hasanchartworld.com>";
const MAX_WAIT_MS = 60_000;
const POLL_MS = 5_000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchBtcPrice() {
  const response = await fetch(
    "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"
  );
  const data = await response.json().catch(() => null);
  const price = Number(data?.data?.[0]?.last);

  if (!Number.isFinite(price)) {
    throw new Error("Failed to fetch BTC price from OKX");
  }

  return price;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testEmail = String(process.env.PRICE_ALERT_TEST_EMAIL || "").trim().toLowerCase();

  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(serviceRoleKey, "Missing SUPABASE_SERVICE_ROLE_KEY");
  assert(testEmail, "Missing PRICE_ALERT_TEST_EMAIL for smoke test");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const currentPrice = await fetchBtcPrice();
  const targetPrice = Math.max(1, Math.floor(currentPrice * 0.5));
  const startedBefore = new Date(Date.now() - 5_000).toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("price_alerts")
    .insert([
      {
        user_email: testEmail,
        username: "alert-smoke-test",
        coin: "BTCUSDT",
        target_price: String(targetPrice),
        condition: "above",
        status: "active",
      },
    ])
    .select("id, status, target_price, coin, user_email")
    .single();

  if (insertError) {
    throw new Error(`Alert insert failed: ${insertError.message}`);
  }

  console.log("PRICE_ALERT_SMOKE_INSERTED", {
    alertId: inserted.id,
    targetPrice,
    currentPrice,
    email: testEmail,
  });

  const startedAt = Date.now();
  let triggeredAt = null;

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));

    const { data: alertRow, error: readError } = await supabase
      .from("price_alerts")
      .select("id, status, triggered_at, triggered_price")
      .eq("id", inserted.id)
      .maybeSingle();

    if (readError) {
      throw new Error(`Alert read failed: ${readError.message}`);
    }

    if (alertRow?.status === "triggered") {
      triggeredAt = alertRow.triggered_at;
      console.log("PRICE_ALERT_SMOKE_TRIGGERED", {
        alertId: alertRow.id,
        triggeredAt: alertRow.triggered_at,
        triggeredPrice: alertRow.triggered_price,
        elapsedMs: Date.now() - startedAt,
        expectedSender: EXPECTED_FROM,
      });
      break;
    }
  }

  if (!triggeredAt) {
    throw new Error(
      `Alert ${inserted.id} was not triggered within ${MAX_WAIT_MS}ms. Ensure worker/index.js is running.`
    );
  }

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const { data: notificationRow, error: notificationError } = await supabase
      .from("notifications")
      .select("id, type, user_email, title, created_at")
      .eq("user_email", testEmail)
      .eq("type", "price-alert")
      .gte("created_at", startedBefore)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (notificationError) {
      throw new Error(`Notification read failed: ${notificationError.message}`);
    }

    if (notificationRow?.id) {
      console.log("PRICE_ALERT_SMOKE_SITE_NOTIFICATION", {
        alertId: inserted.id,
        notificationId: notificationRow.id,
        type: notificationRow.type,
        title: notificationRow.title,
        createdAt: notificationRow.created_at,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  throw new Error(
    `Alert ${inserted.id} triggered but no site notification appeared within ${MAX_WAIT_MS}ms.`
  );
}

main().catch((error) => {
  console.error("PRICE_ALERT_SMOKE_FAILED", error?.message || error);
  process.exit(1);
});

require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in worker/.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const CHECK_INTERVAL_MS = 15000;
const MAX_ALERTS_PER_RUN = 20;

const normalizeSymbol = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

const normalizeCondition = (value) => {
  return String(value || "above").trim().toLowerCase() === "below" ? "below" : "above";
};

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatNumber = (value) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return String(value || "");

  return numberValue.toLocaleString("en-US", {
    maximumFractionDigits: numberValue >= 1 ? 4 : 8,
  });
};

const getMarketPrice = async (symbol) => {
  const cleanSymbol = normalizeSymbol(symbol);

  if (!cleanSymbol) {
    throw new Error("EMPTY_SYMBOL");
  }

  const okxSymbol = cleanSymbol.replace("USDT", "-USDT");

  const response = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(okxSymbol)}`
  );

  const data = await response.json();
  const price = Number(data?.data?.[0]?.last);

  if (Number.isFinite(price)) {
    return price;
  }

  throw new Error(`تعذر جلب سعر ${cleanSymbol} من OKX`);
};

const sendTriggeredAlertEmail = async ({ email, coin, condition, targetPrice, currentPrice }) => {
  if (!resendApiKey || !email) {
    return {
      sent: false,
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
    };
  }

  const safeCoin = escapeHtml(coin);
  const conditionText = normalizeCondition(condition) === "below" ? "هبط السعر إلى" : "صعد السعر إلى";
  const safeTargetPrice = escapeHtml(formatNumber(targetPrice));
  const safeCurrentPrice = escapeHtml(formatNumber(currentPrice));

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "HasaN CharT World <alerts@hasanchartworld.com>",
      to: email,
      subject: `🔔 تحقق تنبيه ${safeCoin}`,
      html: `
<div style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;width:100%;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;background:#07142f;border-radius:24px;overflow:hidden;border:1px solid rgba(34,211,238,0.18);box-shadow:0 0 40px rgba(37,99,235,0.22);">

          <tr>
            <td style="background:linear-gradient(135deg,#07142f 0%,#0b63ff 55%,#06b6d4 100%);padding:34px 22px;text-align:center;">
              <div style="display:inline-block;background:rgba(2,6,23,0.28);border:1px solid rgba(255,255,255,0.25);border-radius:999px;padding:10px 18px;color:#ffffff;font-size:14px;font-weight:900;">
                🔔 Price Alert Triggered
              </div>

              <h1 style="margin:24px 0 0;color:#ffffff;font-size:34px;line-height:1.5;font-weight:900;text-align:center;">
                تم تفعيل تنبيه السعر
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 20px 10px;">
              <div style="background:#020817;border:1px solid rgba(34,211,238,0.16);border-radius:20px;padding:22px;color:#e2e8f0;font-size:20px;line-height:2.1;font-weight:600;text-align:center;">
                تم تفعيل التنبيه لعملة
                <strong style="color:#67e8f9;">${safeCoin}</strong>
                لأن السعر ${conditionText} المستوى المحدد.
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 20px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="50%" style="padding-left:6px;">
                    <div style="background:#0b1b3a;border:1px solid rgba(34,211,238,0.16);border-radius:18px;padding:22px;text-align:center;">
                      <div style="color:#93c5fd;font-size:13px;font-weight:800;margin-bottom:10px;">
                        السعر المستهدف
                      </div>

                      <div style="color:#67e8f9;font-size:28px;font-weight:900;word-break:break-word;">
                        ${safeTargetPrice}
                      </div>
                    </div>
                  </td>

                  <td width="50%" style="padding-right:6px;">
                    <div style="background:#0b1b3a;border:1px solid rgba(34,211,238,0.16);border-radius:18px;padding:22px;text-align:center;">
                      <div style="color:#93c5fd;font-size:13px;font-weight:800;margin-bottom:10px;">
                        السعر الحالي
                      </div>

                      <div style="color:#ffffff;font-size:28px;font-weight:900;word-break:break-word;">
                        ${safeCurrentPrice}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:32px 20px 34px;">
              <a href="https://www.hasanchartworld.com" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#2563eb);color:#ffffff;text-decoration:none;padding:18px 34px;border-radius:18px;font-size:17px;font-weight:900;box-shadow:0 0 22px rgba(37,99,235,0.35);">
                فتح منصة HasaN CharT
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</div>
      `,
    }),
  });

  const data = await response.json().catch(() => null);

  return {
    sent: response.ok,
    status: response.status,
    data,
  };
};

const shouldTriggerAlert = ({ condition, targetPrice, currentPrice }) => {
  const cleanCondition = normalizeCondition(condition);

  if (!Number.isFinite(targetPrice) || !Number.isFinite(currentPrice)) {
    return false;
  }

  if (cleanCondition === "below") {
    return currentPrice <= targetPrice;
  }

  return currentPrice >= targetPrice;
};

async function checkPriceAlerts() {
  console.log("🔍 Checking active price alerts...");

  const { data: alerts, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("status", "active")
    .limit(MAX_ALERTS_PER_RUN);

  if (error) {
    console.log("❌ Error fetching price alerts:", error.message);
    return;
  }

  if (!alerts || alerts.length === 0) {
    console.log("📭 No active price alerts.");
    return;
  }

  const priceCache = new Map();

  for (const alert of alerts) {
    const coin = normalizeSymbol(alert.coin);
    const targetPrice = Number(alert.target_price);
    const condition = normalizeCondition(alert.condition);

    if (!alert.user_email || !coin || !Number.isFinite(targetPrice)) {
      console.log("⚠️ Skipping invalid alert:", alert.id);
      continue;
    }

    try {
      let currentPrice = priceCache.get(coin);

      if (!currentPrice) {
        currentPrice = await getMarketPrice(coin);
        priceCache.set(coin, currentPrice);
      }

      console.log(
        `📊 ${coin}: current=${formatNumber(currentPrice)} target=${formatNumber(targetPrice)} condition=${condition}`
      );

      const triggered = shouldTriggerAlert({
        condition,
        targetPrice,
        currentPrice,
      });

      if (!triggered) continue;

      console.log("🚨 Price alert triggered:", coin, alert.user_email);

      const emailResult = await sendTriggeredAlertEmail({
        email: alert.user_email,
        coin,
        condition,
        targetPrice,
        currentPrice,
      });

      if (!emailResult.sent) {
        console.log("❌ Alert email failed:", JSON.stringify(emailResult, null, 2));
        continue;
      }

      const { error: updateError } = await supabase
        .from("price_alerts")
        .update({
          status: "triggered",
        })
        .eq("id", alert.id);

      if (updateError) {
        console.log("❌ Alert status update error:", updateError.message);
      } else {
        console.log("✅ Alert email sent and status updated:", coin);
      }
    } catch (error) {
      console.log("❌ Price alert processing error:", coin, error?.message || error);
    }
  }
}

setInterval(checkPriceAlerts, CHECK_INTERVAL_MS);

console.log("🚀 Price Alerts Worker started...");
checkPriceAlerts();
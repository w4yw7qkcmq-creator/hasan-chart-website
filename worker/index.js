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
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;background:#07142f;border:1px solid rgba(34,211,238,0.22);border-radius:24px;overflow:hidden;box-shadow:0 0 42px rgba(37,99,235,0.24);">
          <tr>
            <td style="padding:0;">
              <div style="background:linear-gradient(135deg,#07142f 0%,#0b63ff 55%,#06b6d4 100%);padding:30px 22px;text-align:center;">
                <div style="display:inline-block;background:rgba(2,6,23,0.28);border:1px solid rgba(255,255,255,0.28);border-radius:999px;padding:9px 16px;color:#ffffff;font-size:13px;font-weight:800;letter-spacing:0.3px;white-space:nowrap;">
                  HasaN CharT World
                </div>
                <h1 style="margin:18px 0 0;color:#ffffff;font-size:27px;line-height:1.45;font-weight:900;text-align:center;">
                  تحقق التنبيه السعري
                </h1>
                <p style="margin:8px 0 0;color:#dbeafe;font-size:14px;line-height:1.9;text-align:center;">
                  وصل السعر إلى الشرط الذي قمت بتحديده داخل المنصة
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 18px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0b1b3a;border:1px solid rgba(34,211,238,0.20);border-radius:20px;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <div style="color:#93c5fd;font-size:13px;font-weight:800;margin-bottom:9px;">العملة</div>
                    <div style="color:#ffffff;font-size:32px;line-height:1.25;font-weight:900;word-break:break-word;">
                      ${safeCoin}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 18px 6px;">
              <div style="background:#020817;border:1px solid rgba(34,211,238,0.18);border-radius:18px;padding:18px;color:#e2e8f0;font-size:16px;line-height:2.05;font-weight:600;word-break:break-word;">
                تم تفعيل التنبيه بنجاح لأن سعر <strong style="color:#67e8f9;">${safeCoin}</strong> ${conditionText} السعر الذي قمت بتحديده.
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 18px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="50%" style="padding:0 0 0 6px;">
                    <div style="background:#0b1b3a;border:1px solid rgba(34,211,238,0.18);border-radius:18px;padding:18px;text-align:center;">
                      <div style="color:#93c5fd;font-size:13px;font-weight:800;margin-bottom:8px;">السعر المستهدف</div>
                      <div style="color:#67e8f9;font-size:26px;line-height:1.25;font-weight:900;word-break:break-word;">
                        ${safeTargetPrice}
                      </div>
                    </div>
                  </td>
                  <td width="50%" style="padding:0 6px 0 0;">
                    <div style="background:#0b1b3a;border:1px solid rgba(34,211,238,0.18);border-radius:18px;padding:18px;text-align:center;">
                      <div style="color:#93c5fd;font-size:13px;font-weight:800;margin-bottom:8px;">السعر الحالي</div>
                      <div style="color:#ffffff;font-size:26px;line-height:1.25;font-weight:900;word-break:break-word;">
                        ${safeCurrentPrice}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 18px 30px;">
              <a href="https://www.hasanchartworld.com" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#2563eb);color:#ffffff;text-decoration:none;padding:16px 30px;border-radius:16px;font-size:16px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 0 24px rgba(37,99,235,0.38);">
                فتح منصة HasaN CharT
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:17px 18px;background:#020617;border-top:1px solid rgba(255,255,255,0.07);text-align:center;color:#64748b;font-size:12px;line-height:1.9;">
              <div style="font-weight:900;color:#e2e8f0;white-space:nowrap;">HasaN CharT World</div>
              <div style="color:#94a3b8;">Trading Intelligence Platform</div>
              <div style="color:#64748b;">© 2026 جميع الحقوق محفوظة</div>
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
        console.log("❌ Alert email failed:", emailResult);
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
import { getSupabaseAdmin } from "./auth-session";
import { processEmailQueue } from "./email-queue";
import { sendPriceAlertPush } from "./push-notifications";

export const PRICE_ALERTS_RUNNER_VERSION = "2026-06-24-v6-real-sender-log";
export const CHECK_INTERVAL_MS = 12000;
export const MAX_ALERTS_PER_RUN = 20;
const RUNNER_PATH = "nextjs-price-alerts-runner";

let schedulerStarted = false;
let checkInFlight = false;

function logPriceAlertEvent(tag, payload = {}) {
  const line = `${tag} ${JSON.stringify({
    path: RUNNER_PATH,
    moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
    ...payload,
    ts: new Date().toISOString(),
  })}`;

  if (tag.includes("FAILED") || payload?.success === false) {
    console.error(line);
    return;
  }

  console.log(line);
}

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeCondition(value) {
  return String(value || "above").trim().toLowerCase() === "below" ? "below" : "above";
}

function formatCoinPair(coin) {
  const symbol = normalizeSymbol(coin);
  if (!symbol) return "";
  if (symbol.endsWith("USDT")) {
    return `${symbol.slice(0, -4)}-USDT`;
  }
  return symbol;
}

function formatNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value || "");
  return numberValue.toLocaleString("en-US", {
    maximumFractionDigits: numberValue >= 1 ? 4 : 8,
  });
}

function getConditionLabel(condition) {
  return normalizeCondition(condition) === "below"
    ? "وصول السعر للأسفل"
    : "وصول السعر للأعلى";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPriceAlertPushBody({ coin, targetPrice, currentPrice }) {
  const coinLabel = formatCoinPair(coin);
  return [
    `العملة: ${coinLabel}`,
    `السعر المطلوب: ${formatNumber(targetPrice)}`,
    `السعر الحالي: ${formatNumber(currentPrice)}`,
  ].join(" | ");
}

function buildPriceAlertNotificationMessage({ coin, targetPrice, currentPrice, condition }) {
  const coinLabel = formatCoinPair(coin);
  const conditionLabel = getConditionLabel(condition);

  return [
    `العملة: ${coinLabel}`,
    `السعر الذي طلبته: ${formatNumber(targetPrice)}`,
    `السعر الحالي عند التفعيل: ${formatNumber(currentPrice)}`,
    "",
    `نوع التنبيه: ${conditionLabel}`,
    "",
    "تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.",
  ].join("\n");
}

async function getMarketPrice(symbol) {
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
}

function shouldTriggerAlert({ condition, targetPrice, currentPrice }) {
  const cleanCondition = normalizeCondition(condition);

  if (!Number.isFinite(targetPrice) || !Number.isFinite(currentPrice)) {
    return false;
  }

  if (cleanCondition === "below") {
    return currentPrice <= targetPrice;
  }

  return currentPrice >= targetPrice;
}

async function sendTriggeredAlertEmail({
  email,
  coin,
  condition,
  targetPrice,
  currentPrice,
  alertId,
  userId = null,
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const coinLabel = formatCoinPair(coin);

  console.log("PRICE_ALERT_EMAIL_REAL_PATH_FOUND", {
    alertId,
    email,
    userId: userId || null,
    path: "lib/price-alerts-runner::sendTriggeredAlertEmail",
    coin: coinLabel,
    targetPrice,
    currentPrice,
  });

  if (!resendApiKey || !email) {
    return {
      success: false,
      skipped: true,
      sent: false,
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
    };
  }

  const safeCoin = escapeHtml(coinLabel);
  const conditionLabel = getConditionLabel(condition);
  const safeConditionLabel = escapeHtml(conditionLabel);
  const safeTargetPrice = escapeHtml(formatNumber(targetPrice));
  const safeCurrentPrice = escapeHtml(formatNumber(currentPrice));

  console.log("REAL_PRICE_ALERT_EMAIL_SENDER_FOUND", {
    file: "lib/price-alerts-runner.js",
    function: "sendTriggeredAlertEmail",
    alertId,
    email,
    userId: userId || null,
    coin: coinLabel,
    targetPrice,
    currentPrice,
    moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "HasaN CharT World <alerts@hasanchartworld.com>",
      to: email,
      subject: `✅ وصل السعر إلى هدف التنبيه - ${safeCoin}`,
      html: `
<div style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;width:100%;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;background:#07142f;border-radius:24px;overflow:hidden;border:1px solid rgba(34,211,238,0.18);box-shadow:0 0 40px rgba(37,99,235,0.22);">
          <tr>
            <td style="background:linear-gradient(135deg,#07142f 0%,#0b63ff 55%,#06b6d4 100%);padding:34px 22px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.6;font-weight:900;text-align:center;">
                ✅ وصل السعر إلى هدف التنبيه
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 20px 10px;">
              <div style="background:#020817;border:1px solid rgba(34,211,238,0.16);border-radius:20px;padding:22px;color:#e2e8f0;font-size:18px;line-height:2;font-weight:600;text-align:right;">
                <p style="margin:0 0 8px;"><strong>العملة:</strong> ${safeCoin}</p>
                <p style="margin:0 0 8px;"><strong>السعر الذي طلبته:</strong> ${safeTargetPrice}</p>
                <p style="margin:0 0 8px;"><strong>السعر الحالي عند التفعيل:</strong> ${safeCurrentPrice}</p>
                <p style="margin:0 0 8px;"><strong>نوع التنبيه:</strong> ${safeConditionLabel}</p>
                <p style="margin:16px 0 0;color:#94a3b8;font-size:15px;">تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 20px 34px;">
              <a href="https://www.hasanchartworld.com/alerts" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#2563eb);color:#ffffff;text-decoration:none;padding:18px 34px;border-radius:18px;font-size:17px;font-weight:900;box-shadow:0 0 22px rgba(37,99,235,0.35);">
                فتح تنبيهات الأسعار
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

  if (!response.ok) {
    logPriceAlertEvent("PRICE_ALERT_EMAIL_FAILED", {
      alertId,
      email,
      coin: coinLabel,
      targetPrice,
      currentPrice,
      status: response.status,
      message: data?.message || response.statusText || "Email provider error",
    });

    return {
      success: false,
      sent: false,
      status: response.status,
      error: data?.message || response.statusText || "Email provider error",
      result: data,
    };
  }

  logPriceAlertEvent("PRICE_ALERT_EMAIL_SENT", {
    alertId,
    email,
    coin: coinLabel,
    targetPrice,
    currentPrice,
    resendId: data?.id || null,
  });

  console.log("PRICE_ALERT_PUSH_START", {
    alertId,
    email,
    userId: userId || null,
    source: "lib/price-alerts-runner::sendTriggeredAlertEmail",
  });

  try {
    const pushStats = await sendPriceAlertPush({
      supabase,
      email,
      userId,
      alertId,
      title: "✅ وصل السعر إلى هدف التنبيه",
      body: buildPriceAlertPushBody({ coin, targetPrice, currentPrice }),
      url: "https://www.hasanchartworld.com/alerts",
    });

    if ((pushStats?.sent || 0) > 0) {
      console.log("PRICE_ALERT_PUSH_SENT", {
        alertId,
        email,
        userId: userId || null,
        pushStats,
      });
    }
  } catch (error) {
    console.log("PRICE_ALERT_PUSH_FAILED", error);
  }

  return {
    success: true,
    sent: true,
    status: response.status,
    id: data?.id || null,
    data,
  };
}

export async function checkPriceAlerts() {
  if (checkInFlight) {
    return { skipped: true, reason: "CHECK_ALREADY_IN_FLIGHT" };
  }

  checkInFlight = true;

  const summary = {
    checked: 0,
    uniqueCoins: 0,
    triggered: 0,
    notificationsCreated: 0,
    pushesSent: 0,
    pushesFailed: 0,
    pushesSkipped: 0,
    emailsQueued: 0,
    alertsUpdated: 0,
    skippedInvalid: 0,
    emailStats: null,
  };

  try {
    const supabase = getSupabaseAdmin();

    logPriceAlertEvent("PRICE_ALERT_CHECK_STARTED", {
      intervalMs: CHECK_INTERVAL_MS,
    });

    const { data: alerts, error } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("status", "active")
      .limit(MAX_ALERTS_PER_RUN);

    if (error) {
      logPriceAlertEvent("PRICE_ALERT_CHECK_FAILED", {
        message: error.message,
      });
      return summary;
    }

    if (!alerts || alerts.length === 0) {
      logPriceAlertEvent("PRICE_ALERT_CHECK_FINISHED", summary);
      return summary;
    }

    summary.checked = alerts.length;

    const alertsByCoin = new Map();

    for (const alert of alerts) {
      const coin = normalizeSymbol(alert.coin);
      if (!coin) {
        summary.skippedInvalid += 1;
        continue;
      }

      if (!alertsByCoin.has(coin)) {
        alertsByCoin.set(coin, []);
      }

      alertsByCoin.get(coin).push(alert);
    }

    summary.uniqueCoins = alertsByCoin.size;

    const emailJobs = [];

    for (const [coin, coinAlerts] of alertsByCoin.entries()) {
      try {
        const currentPrice = await getMarketPrice(coin);

        for (const alert of coinAlerts) {
          const targetPrice = Number(alert.target_price);
          const condition = normalizeCondition(alert.condition);
          const userEmail = String(alert.user_email || "").trim().toLowerCase();

          if (!userEmail || !Number.isFinite(targetPrice)) {
            summary.skippedInvalid += 1;
            continue;
          }

          const triggered = shouldTriggerAlert({
            condition,
            targetPrice,
            currentPrice,
          });

          if (!triggered) {
            continue;
          }

          logPriceAlertEvent("PRICE_ALERT_TRIGGERED_REAL_PATH", {
            alertId: alert.id,
            email: userEmail,
            coin: formatCoinPair(coin),
            targetPrice,
            currentPrice,
            condition,
            conditionLabel: getConditionLabel(condition),
          });

          const { data: claimedAlert, error: claimError } = await supabase
            .from("price_alerts")
            .update({
              status: "triggered",
              triggered_at: new Date().toISOString(),
              triggered_price: String(currentPrice),
            })
            .eq("id", alert.id)
            .eq("status", "active")
            .select("id")
            .maybeSingle();

          if (claimError) {
            logPriceAlertEvent("PRICE_ALERT_CLAIM_FAILED", {
              alertId: alert.id,
              email: userEmail,
              message: claimError.message,
            });
            continue;
          }

          if (!claimedAlert?.id) {
            logPriceAlertEvent("PRICE_ALERT_ALREADY_CLAIMED", {
              alertId: alert.id,
              email: userEmail,
            });
            continue;
          }

          summary.alertsUpdated += 1;

          const notificationMessage = buildPriceAlertNotificationMessage({
            coin,
            targetPrice,
            currentPrice,
            condition,
          });

          const { error: notificationError } = await supabase.from("notifications").insert({
            user_email: userEmail,
            title: "✅ وصل السعر إلى هدف التنبيه",
            message: notificationMessage,
            type: "price-alert",
            is_read: false,
          });

          if (notificationError) {
            logPriceAlertEvent("PRICE_ALERT_NOTIFICATION_FAILED", {
              alertId: alert.id,
              email: userEmail,
              message: notificationError.message,
            });
          } else {
            summary.notificationsCreated += 1;
          }

          emailJobs.push({
            to: userEmail,
            alertId: alert.id,
            send: () =>
              sendTriggeredAlertEmail({
                email: userEmail,
                coin,
                condition,
                targetPrice,
                currentPrice,
                alertId: alert.id,
                userId: alert.user_id || null,
              }),
          });

          summary.emailsQueued += 1;
          summary.triggered += 1;
        }
      } catch (coinError) {
        logPriceAlertEvent("PRICE_ALERT_COIN_CHECK_FAILED", {
          coin,
          message: coinError?.message || String(coinError),
        });
      }
    }

    if (emailJobs.length > 0) {
      summary.emailStats = await processEmailQueue(emailJobs, {
        label: "price-alerts-real-path",
      });
    }

    logPriceAlertEvent("PRICE_ALERT_CHECK_FINISHED", summary);
    return summary;
  } finally {
    checkInFlight = false;
  }
}

export function startPriceAlertsScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;

  logPriceAlertEvent("PRICE_ALERTS_SCHEDULER_STARTED", {
    intervalMs: CHECK_INTERVAL_MS,
    runtime: "nextjs",
    webPushConfigured: Boolean(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT
    ),
  });

  setInterval(() => {
    checkPriceAlerts().catch((error) => {
      logPriceAlertEvent("PRICE_ALERT_CHECK_FAILED", {
        message: error?.message || String(error),
      });
    });
  }, CHECK_INTERVAL_MS);

  checkPriceAlerts().catch((error) => {
    logPriceAlertEvent("PRICE_ALERT_CHECK_FAILED", {
      message: error?.message || String(error),
    });
  });
}

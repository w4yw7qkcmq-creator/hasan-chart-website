import { getSupabaseAdmin } from "./auth-session";
import { createUserNotification } from "./create-user-notification";
import { buildPriceAlertEmailPayload } from "./price-alert-email";
import { sendPriceAlertPush } from "./push-notifications";

export const PRICE_ALERTS_RUNNER_VERSION = "2026-07-01-v17-path-markers-nextjs";
export const CHECK_INTERVAL_MS = 30_000;
export const MAX_ALERTS_PER_RUN = 20;

const RUNNER_PATH = "lib/price-alerts-runner.js";
let checkInFlight = false;

function logPriceAlertEvent(tag, payload = {}) {
  const line = `${tag} ${JSON.stringify({
    path: RUNNER_PATH,
    moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
    ...payload,
    ts: new Date().toISOString(),
  })}`;

  if (tag.includes("FAILED") || tag.includes("ERROR") || payload?.success === false) {
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

function normalizeOkxInstrument(coin) {
  const raw = String(coin || "").trim().toUpperCase();
  if (!raw) throw new Error("EMPTY_SYMBOL");
  if (raw.includes("-")) return raw.replace(/[^A-Z0-9-]/g, "");
  const cleanSymbol = normalizeSymbol(coin);
  if (!cleanSymbol) throw new Error("EMPTY_SYMBOL");
  if (cleanSymbol.endsWith("USDT")) {
    const base = cleanSymbol.slice(0, -4);
    if (!base) throw new Error("EMPTY_SYMBOL");
    return `${base}-USDT`;
  }
  return `${cleanSymbol}-USDT`;
}

async function getMarketPrice(symbol) {
  const cleanSymbol = normalizeSymbol(symbol);
  if (!cleanSymbol) throw new Error("EMPTY_SYMBOL");

  const okxSymbol = normalizeOkxInstrument(symbol);
  const response = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(okxSymbol)}`
  );
  const data = await response.json().catch(() => null);
  const price = Number(data?.data?.[0]?.last);

  if (Number.isFinite(price)) return price;
  throw new Error(`تعذر جلب سعر ${cleanSymbol} من OKX`);
}

function shouldTriggerAlert({ condition, targetPrice, currentPrice }) {
  const cleanCondition = normalizeCondition(condition);
  if (!Number.isFinite(targetPrice) || !Number.isFinite(currentPrice)) return false;
  if (cleanCondition === "below") return currentPrice <= targetPrice;
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

  console.log(
    "PRICE_ALERT_EMAIL_PATH_B",
    JSON.stringify({
      path: `${RUNNER_PATH}::sendTriggeredAlertEmail`,
      alertId,
      email,
      userId: userId || null,
      coin: coinLabel,
      targetPrice,
      currentPrice,
      moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
    })
  );

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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(
      buildPriceAlertEmailPayload({
        email,
        coinLabel: safeCoin,
        conditionLabel: safeConditionLabel,
        targetPrice: safeTargetPrice,
        currentPrice: safeCurrentPrice,
        alertId,
      })
    ),
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

  return {
    success: true,
    sent: true,
    status: response.status,
    id: data?.id || null,
    data,
  };
}

async function deliverNextjsPriceAlert({
  supabase,
  summary,
  alertId,
  userEmail,
  userId,
  coin,
  condition,
  targetPrice,
  currentPrice,
  notificationMessage,
}) {
  console.log(
    "REAL_ALERT_DELIVERY_PATH",
    JSON.stringify({
      path: `${RUNNER_PATH}::deliverNextjsPriceAlert`,
      phase: "dispatch-start",
      alertId,
      email: userEmail,
      userId: userId || null,
      moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
    })
  );

  try {
    const { data: notificationRow, error: notificationError } = await createUserNotification(
      supabase,
      {
        userEmail,
        title: "🔔 وصل السعر إلى هدف التنبيه",
        message: notificationMessage,
        type: "price-alert",
      }
    );

    if (notificationError) {
      logPriceAlertEvent("PRICE_ALERT_NOTIFICATION_FAILED", {
        alertId,
        email: userEmail,
        message: notificationError.message,
      });
    } else {
      summary.notificationsCreated += 1;
      console.log(
        "REAL_ALERT_NOTIFICATION_CREATED",
        JSON.stringify({
          path: `${RUNNER_PATH}::deliverNextjsPriceAlert`,
          alertId,
          email: userEmail,
          notificationId: notificationRow?.id || null,
        })
      );
    }
  } catch (error) {
    logPriceAlertEvent("PRICE_ALERT_NOTIFICATION_FAILED", {
      alertId,
      email: userEmail,
      message: error?.message || String(error),
    });
  }

  try {
    const pushStats = await sendPriceAlertPush({
      supabase,
      email: userEmail,
      userId,
      alertId,
      title: "🔔 وصل السعر إلى هدف التنبيه",
      body: buildPriceAlertPushBody({ coin, targetPrice, currentPrice }),
      url: "https://www.hasanchartworld.com/alerts",
    });

    summary.pushesSent += pushStats?.sent || 0;
    summary.pushesFailed += pushStats?.failed || 0;
    summary.pushesSkipped += pushStats?.skipped || 0;

    if ((pushStats?.sent || 0) > 0) {
      console.log(
        "REAL_ALERT_PUSH_SENT",
        JSON.stringify({
          path: `${RUNNER_PATH}::deliverNextjsPriceAlert`,
          alertId,
          email: userEmail,
          sent: pushStats.sent,
        })
      );
    }
  } catch (error) {
    summary.pushesFailed += 1;
    logPriceAlertEvent("PRICE_ALERT_PUSH_FAILED", {
      alertId,
      email: userEmail,
      message: error?.message || String(error),
    });
  }

  summary.emailsQueued += 1;

  try {
    const emailResult = await sendTriggeredAlertEmail({
      email: userEmail,
      coin,
      condition,
      targetPrice,
      currentPrice,
      alertId,
      userId,
    });

    if (emailResult?.sent) {
      console.log(
        "REAL_ALERT_EMAIL_SENT",
        JSON.stringify({
          path: `${RUNNER_PATH}::deliverNextjsPriceAlert`,
          alertId,
          email: userEmail,
          resendId: emailResult?.id || null,
        })
      );
    }

    return emailResult;
  } catch (error) {
    logPriceAlertEvent("PRICE_ALERT_EMAIL_FAILED", {
      alertId,
      email: userEmail,
      message: error?.message || String(error),
    });

    return {
      success: false,
      sent: false,
      error: error?.message || String(error),
    };
  }
}

export async function checkPriceAlerts() {
  if (checkInFlight) {
    logPriceAlertEvent("PRICE_ALERT_CHECK_SKIPPED", { reason: "PREVIOUS_CHECK_IN_PROGRESS" });
    return { skipped: true, reason: "PREVIOUS_CHECK_IN_PROGRESS" };
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
    path: RUNNER_PATH,
  };

  try {
    console.log(
      "PRICE_ALERT_EMAIL_PATH_B",
      JSON.stringify({
        path: `${RUNNER_PATH}::checkPriceAlerts`,
        phase: "check-start",
        moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
      })
    );

    logPriceAlertEvent("PRICE_ALERT_CHECK_STARTED", {
      intervalMs: CHECK_INTERVAL_MS,
      runtime: "nextjs-api",
    });

    const supabase = getSupabaseAdmin();

    const { data: alerts, error } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("status", "active")
      .limit(MAX_ALERTS_PER_RUN);

    if (error) {
      logPriceAlertEvent("PRICE_ALERT_CHECK_FAILED", { message: error.message });
      return { ...summary, error: error.message };
    }

    if (!alerts?.length) {
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
      if (!alertsByCoin.has(coin)) alertsByCoin.set(coin, []);
      alertsByCoin.get(coin).push(alert);
    }

    summary.uniqueCoins = alertsByCoin.size;

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

          if (!shouldTriggerAlert({ condition, targetPrice, currentPrice })) {
            continue;
          }

          logPriceAlertEvent("PRICE_ALERT_TRIGGERED", {
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
          summary.triggered += 1;

          const notificationMessage = buildPriceAlertNotificationMessage({
            coin,
            targetPrice,
            currentPrice,
            condition,
          });

          await deliverNextjsPriceAlert({
            supabase,
            summary,
            alertId: alert.id,
            userEmail,
            userId: alert.user_id || null,
            coin,
            condition,
            targetPrice,
            currentPrice,
            notificationMessage,
          });
        }
      } catch (coinError) {
        logPriceAlertEvent("PRICE_ALERT_COIN_CHECK_FAILED", {
          coin,
          message: coinError?.message || String(coinError),
        });
      }
    }

    console.log(
      "REAL_ALERT_SUMMARY",
      JSON.stringify({
        path: RUNNER_PATH,
        moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
        triggered: summary.triggered,
        notificationsCreated: summary.notificationsCreated,
        pushesSent: summary.pushesSent,
        emailsQueued: summary.emailsQueued,
      })
    );

    logPriceAlertEvent("PRICE_ALERT_CHECK_FINISHED", summary);
    return summary;
  } finally {
    checkInFlight = false;
  }
}

export function startPriceAlertsScheduler() {
  console.log(
    "PRICE_ALERT_RUNNER_SCHEDULER_DISABLED",
    JSON.stringify({
      path: RUNNER_PATH,
      reason: "Use /api/check-price-alerts cron or worker/index.js scheduler",
      moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
    })
  );
}

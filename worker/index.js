const path = require("path");

if (process.env.NODE_ENV !== "production") {
  console.log("WORKER_ENTRY_FILE", __filename);
  console.log("WORKER_ENTRY_REALPATH", path.resolve(__filename));
  console.log("WORKER_PROCESS_CWD", process.cwd());
}

try {
  require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
  require("dotenv").config();
} catch (_) {
  // dotenv is optional on Railway — env vars are injected by the platform
}
const express = require("express");
const cors = require("cors");
const {
  createWorkerCorsOptions,
  workerAccessDeniedMiddleware,
  instantAnalysisRateLimitMiddleware,
} = require("./worker-security");
const { redactLogMeta } = require("./log-redaction");

const WebSocket = require("ws");
global.WebSocket = WebSocket;

const { createClient } = require("@supabase/supabase-js");
const {
  validatePriceAlertsEnvironment,
  isPriceAlertWorkerEnabled,
  resolveCheckIntervalMs,
  DEFAULT_MAX_ALERTS_PER_RUN,
} = require("./alerts/price-alerts-env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

const environmentValidation = validatePriceAlertsEnvironment();
const CHECK_INTERVAL_MS = environmentValidation.checkIntervalMs || resolveCheckIntervalMs();
const MAX_ALERTS_PER_RUN =
  environmentValidation.maxAlertsPerRun ||
  Number(process.env.PRICE_ALERT_MAX_ALERTS_PER_RUN) ||
  DEFAULT_MAX_ALERTS_PER_RUN;
const startupReady = environmentValidation.ok && Boolean(supabaseUrl && serviceRoleKey);

if (!startupReady) {
  console.error(
    "PRICE_ALERT_WORKER_STARTUP_BLOCKED",
    JSON.stringify({
      missingRequiredCount: environmentValidation.missingRequiredCount,
      invalidRequiredCount: environmentValidation.invalidRequiredCount,
      missing: environmentValidation.missingRequired,
      invalid: environmentValidation.invalidRequired,
    })
  );
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { logWorkerEvent } = require("./alert-logger");
const { sendPriceAlertPushNotifications, getVapidEnvStatus } = require("./push-sender");
const { sendPriceAlertEmail } = require("./price-alert-email");
const { createUserNotification } = require("./create-user-notification");
const { evaluateDeliveryForRecipient } = require("./notification-delivery-gate");
const { evaluatePriceAlertCondition, normalizeCondition } = require("./lib/price-alert-condition");
const {
  normalizeSymbol,
  normalizeOkxInstrument,
  fetchOkxTicker,
  fetchOkxPricesByCoin,
} = require("./lib/price-alert-market-price");
const {
  acquireDistributedCycleLock,
  releaseDistributedCycleLock,
  getDistributedLockMetrics,
  getInstanceId,
} = require("./lib/price-alert-distributed-lock");
const { claimActivePriceAlert } = require("./lib/price-alert-atomic-claim");
const {
  beginChannelDelivery,
  finalizeChannelDelivery,
} = require("./lib/price-alert-delivery-state");
const {
  createRunId,
  buildCycleTelemetryRow,
  persistCycleTelemetry,
  cleanupOldRuns,
} = require("./lib/price-alert-worker-cycle-telemetry");
const {
  getCycleMetrics,
  markCycleStart,
  markCycleSuccess,
  markCycleFailed,
  incrementMetric,
} = require("./lib/price-alert-worker-metrics");

const WORKER_ENTRY = "worker/index.js";
const PRICE_ALERTS_MODULE_VERSION = "2026-06-23-v25-block-website-price-alert-email";
const PRICE_ALERT_SINGLE_PATH = "worker/index.js::deliverRealPriceAlert";

function logPriceAlertDeliveryError({ alertId, email, userId, phase, message, details = {} }) {
  console.error(
    "PRICE_ALERT_DELIVERY_ERROR",
    JSON.stringify(
      redactLogMeta({
        path: PRICE_ALERT_SINGLE_PATH,
        alertId,
        email: email || null,
        userId: userId || null,
        phase,
        message: message || "DELIVERY_FAILED",
        moduleVersion: PRICE_ALERTS_MODULE_VERSION,
        ...details,
      })
    )
  );
}

console.log(
  "PRICE_ALERT_SINGLE_PATH",
  JSON.stringify({
    phase: "worker-boot",
    path: PRICE_ALERT_SINGLE_PATH,
    worker: WORKER_ENTRY,
    moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    scheduler: "checkPriceAlerts",
  })
);

let priceAlertCheckInProgress = false;

function getSupabaseClient() {
  return supabase;
}

console.log(
  "price_alert_worker_startup_validated",
  JSON.stringify({
    checkIntervalMs: CHECK_INTERVAL_MS,
    maxAlertsPerRun: MAX_ALERTS_PER_RUN,
    workerEnabled: isPriceAlertWorkerEnabled(),
    instanceId: getInstanceId(),
  })
);
const PRICE_ALERT_WORKER_COLUMNS =
  "id,user_email,coin,target_price,condition,status";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors(createWorkerCorsOptions()));
app.use(express.json({ limit: "2mb" }));

const analysisJobs = new Map();

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatCoinPair = (coin) => {
  const symbol = normalizeSymbol(coin);

  if (!symbol) return "";

  if (symbol.endsWith("USDT")) {
    return `${symbol.slice(0, -4)}-USDT`;
  }

  return symbol;
};

const getConditionLabel = (condition) => {
  return normalizeCondition(condition) === "below"
    ? "وصول السعر للأسفل"
    : "وصول السعر للأعلى";
};

const buildPriceAlertPushBody = ({ coin, targetPrice, currentPrice }) => {
  const coinLabel = formatCoinPair(coin);

  return [
    `العملة: ${coinLabel}`,
    `السعر المطلوب: ${formatNumber(targetPrice)}`,
    `السعر الحالي: ${formatNumber(currentPrice)}`,
  ].join(" | ");
};

async function createSiteNotificationForAlert({
  alertId,
  email,
  notificationMessage,
  coin = null,
  targetPrice = null,
  currentPrice = null,
  userId = null,
  delivery = null,
}) {
  const resolvedDelivery =
    delivery ||
    (await evaluateDeliveryForRecipient(supabase, {
      userEmail: email,
      userId,
      notificationKey: "price_alert",
    }));

  if (!resolvedDelivery.inApp) {
    console.log(
      "PRICE_ALERT_NOTIFICATION_SKIPPED",
      JSON.stringify({
        path: PRICE_ALERT_SINGLE_PATH,
        alertId,
        email,
        userId: userId || null,
        reason: resolvedDelivery.blockedReason || "delivery-blocked",
      })
    );

    return {
      success: false,
      skipped: true,
      reason: resolvedDelivery.blockedReason || "delivery-blocked",
    };
  }

  const { data: notificationRow, error: notificationError } = await createUserNotification(
    supabase,
    {
      userEmail: email,
      title: "🔔 وصل السعر إلى هدف التنبيه",
      message: notificationMessage,
      type: "price-alert",
      notificationKey: "price_alert",
      url: "/alerts?tab=notifications",
      metadata: {
        alertId,
        type: "price-alert",
        notification_key: "price_alert",
        coin: coin || null,
        targetPrice: targetPrice ?? null,
        currentPrice: currentPrice ?? null,
      },
      skipDeliveryGate: true,
    }
  );

  if (notificationError) {
    return { success: false, error: notificationError };
  }

  console.log(
    "PRICE_ALERT_NOTIFICATION_CREATED",
    JSON.stringify({
      path: PRICE_ALERT_SINGLE_PATH,
      alertId,
      email,
      notificationId: notificationRow?.id || null,
      type: "price-alert",
      notificationKey: "price_alert",
      url: "/alerts?tab=notifications",
    })
  );

  return { success: true, data: notificationRow };
}

function aggregatePushStats(summary, pushStats) {
  if (!pushStats) return;

  summary.pushesSent += pushStats.sent || 0;
  summary.pushesFailed += pushStats.failed || 0;
  summary.pushesSkipped += pushStats.skipped || 0;
}

async function sendTriggeredAlertWebPush({
  alertId,
  email,
  userId,
  coin,
  targetPrice,
  currentPrice,
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedUserId = String(userId || "").trim() || null;
  const pushBody = buildPriceAlertPushBody({ coin, targetPrice, currentPrice });

  try {
    return await sendPriceAlertPushNotifications({
      supabase,
      workerEntry: WORKER_ENTRY,
      alertId,
      email: normalizedEmail,
      userId: normalizedUserId,
      title: "🔔 وصل السعر إلى هدف التنبيه",
      body: pushBody,
      url: "/notifications",
    });
  } catch (pushError) {
    return {
      sent: 0,
      failed: 1,
      skipped: 0,
      skipReason: pushError?.message || "WEB_PUSH_DISPATCH_FAILED",
    };
  }
}

const buildPriceAlertNotificationMessage = ({
  coin,
  targetPrice,
  currentPrice,
  condition,
}) => {
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
};

const formatNumber = (value) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return String(value || "");

  return numberValue.toLocaleString("en-US", {
    maximumFractionDigits: numberValue >= 1 ? 4 : 8,
  });
};


const getMarketPrice = async (symbol) => {
  const quote = await fetchOkxTicker(symbol);
  if (!quote.ok) {
    throw new Error(quote.reason === "stale_price" ? "STALE_PRICE" : `تعذر جلب سعر ${normalizeSymbol(symbol)} من OKX`);
  }
  return quote.price;
};

const getMarketCandles = async (symbol, bar = "15m", limit = 120) => {
  const cleanSymbol = normalizeSymbol(symbol);

  if (!cleanSymbol) {
    throw new Error("EMPTY_SYMBOL");
  }

  const okxSymbol = normalizeOkxInstrument(symbol);
  const response = await fetch(
    `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(okxSymbol)}&bar=${encodeURIComponent(bar)}&limit=${encodeURIComponent(String(limit))}`
  );

  console.log("OKX_PRICE_FETCH_ATTEMPT", {
    coin: symbol,
    okxSymbol,
    status: response.status,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.code !== "0" || !Array.isArray(data?.data)) {
    throw new Error(`تعذر جلب شموع ${cleanSymbol} من OKX`);
  }

  return data.data
    .map((item) => ({
      time: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
    }))
    .filter((candle) =>
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    )
    .reverse();
};

async function resolvePriceAlertRecipientEmail({ userEmail, userId }) {
  const fromAlert = String(userEmail || "").trim().toLowerCase();
  if (fromAlert) {
    return fromAlert;
  }

  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return String(data?.email || "").trim().toLowerCase() || null;
}

async function deliverRealPriceAlert({
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
  const normalizedUserId = String(userId || "").trim() || null;
  let normalizedEmail = null;

  try {
    normalizedEmail = await resolvePriceAlertRecipientEmail({
      userEmail,
      userId: normalizedUserId,
    });
  } catch (error) {
    logPriceAlertDeliveryError({
      alertId,
      email: String(userEmail || "").trim().toLowerCase() || null,
      userId: normalizedUserId,
      phase: "email-recipient-resolve",
      message: error?.message || String(error),
    });
  }

  if (!normalizedEmail) {
    console.log(
      "PRICE_ALERT_EMAIL_MISSING_RECIPIENT",
      JSON.stringify({
        path: PRICE_ALERT_SINGLE_PATH,
        alertId,
        userEmail: userEmail || null,
        userId: normalizedUserId,
      })
    );
  }

  console.log(
    "PRICE_ALERT_SINGLE_PATH",
    JSON.stringify({
      path: PRICE_ALERT_SINGLE_PATH,
      phase: "dispatch-start",
      alertId,
      email: normalizedEmail || null,
      userId: normalizedUserId,
      order: ["site-notification", "web-push", "email"],
      moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    })
  );

  let siteNotification = { success: false };
  let delivery = null;

  if (normalizedEmail) {
    delivery = await evaluateDeliveryForRecipient(supabase, {
      userEmail: normalizedEmail,
      userId: normalizedUserId,
      notificationKey: "price_alert",
    });
  }

  const siteGate = await beginChannelDelivery(supabase, { alertId, channel: "site" });
  if (siteGate.skipped && siteGate.reason === "already_sent") {
    siteNotification = { success: true, skipped: false, existing: true };
    incrementMetric("siteNotificationsSent");
  } else if (siteGate.proceed) {
    try {
      siteNotification = await createSiteNotificationForAlert({
        alertId,
        email: normalizedEmail,
        notificationMessage,
        coin,
        targetPrice,
        currentPrice,
        userId: normalizedUserId,
        delivery,
      });

      if (siteNotification?.success) {
        await finalizeChannelDelivery(supabase, {
          alertId,
          channel: "site",
          status: "sent",
        });
        incrementMetric("siteNotificationsSent");
      } else if (!siteNotification?.skipped) {
        await finalizeChannelDelivery(supabase, {
          alertId,
          channel: "site",
          status: "failed",
          errorCodeSafe: siteNotification?.error?.message || "SITE_NOTIFICATION_FAILED",
        });
      } else {
        await finalizeChannelDelivery(supabase, {
          alertId,
          channel: "site",
          status: "skipped",
          errorCodeSafe: siteNotification?.reason || "delivery-blocked",
        });
      }
    } catch (error) {
      await finalizeChannelDelivery(supabase, {
        alertId,
        channel: "site",
        status: "failed",
        errorCodeSafe: error?.message || "SITE_NOTIFICATION_FAILED",
      });
      logPriceAlertDeliveryError({
        alertId,
        email: normalizedEmail,
        userId: normalizedUserId,
        phase: "site-notification",
        message: error?.message || String(error),
      });

      siteNotification = {
        success: false,
        error: { message: error?.message || String(error) },
      };
    }
  }

  if (!siteNotification?.success) {
    if (!siteNotification?.skipped) {
      logPriceAlertDeliveryError({
        alertId,
        email: normalizedEmail,
        userId: normalizedUserId,
        phase: "site-notification",
        message: siteNotification?.error?.message || "SITE_NOTIFICATION_FAILED",
      });
    }
  } else {
    summary.notificationsCreated += 1;
  }

  let pushStats = { sent: 0, failed: 0, skipped: 0, skipReason: "PUSH_NOT_ATTEMPTED" };

  const pushGate = await beginChannelDelivery(supabase, { alertId, channel: "push" });
  if (pushGate.skipped && pushGate.reason === "already_sent") {
    pushStats = { sent: 1, failed: 0, skipped: 0, skipReason: "ALREADY_SENT" };
  } else if (pushGate.proceed) {
    if (delivery?.push) {
      try {
        pushStats = await sendTriggeredAlertWebPush({
          alertId,
          email: normalizedEmail,
          userId: normalizedUserId,
          coin,
          targetPrice,
          currentPrice,
        });
        if ((pushStats?.sent || 0) > 0) {
          await finalizeChannelDelivery(supabase, {
            alertId,
            channel: "push",
            status: "sent",
          });
          incrementMetric("pushSent", pushStats.sent || 0);
        } else if ((pushStats?.failed || 0) > 0) {
          await finalizeChannelDelivery(supabase, {
            alertId,
            channel: "push",
            status: "failed",
            errorCodeSafe: pushStats?.skipReason || "WEB_PUSH_SEND_FAILED",
          });
          incrementMetric("pushFailed", pushStats.failed || 0);
        } else {
          await finalizeChannelDelivery(supabase, {
            alertId,
            channel: "push",
            status: "skipped",
            errorCodeSafe: pushStats?.skipReason || "WEB_PUSH_NOT_SENT",
          });
        }
      } catch (error) {
        await finalizeChannelDelivery(supabase, {
          alertId,
          channel: "push",
          status: "failed",
          errorCodeSafe: error?.message || "WEB_PUSH_DISPATCH_FAILED",
        });
        logPriceAlertDeliveryError({
          alertId,
          email: normalizedEmail,
          userId: normalizedUserId,
          phase: "web-push",
          message: error?.message || String(error),
        });

        pushStats = {
          sent: 0,
          failed: 1,
          skipped: 0,
          skipReason: error?.message || "WEB_PUSH_DISPATCH_FAILED",
        };
        incrementMetric("pushFailed");
      }
    } else {
      pushStats = {
        sent: 0,
        failed: 0,
        skipped: 1,
        skipReason: delivery?.blockedReason || "PUSH_BLOCKED_BY_SETTINGS",
      };
      await finalizeChannelDelivery(supabase, {
        alertId,
        channel: "push",
        status: "skipped",
        errorCodeSafe: pushStats.skipReason,
      });
    }
  }

  aggregatePushStats(summary, pushStats);

  if ((pushStats?.sent || 0) > 0) {
    console.log(
      "WEB_PUSH_SENT",
      JSON.stringify({
        path: PRICE_ALERT_SINGLE_PATH,
        alertId,
        email: normalizedEmail || null,
        userId: normalizedUserId,
        sent: pushStats.sent,
        failed: pushStats.failed || 0,
        foundBy: pushStats.foundBy || null,
      })
    );
  } else if ((pushStats?.failed || 0) > 0) {
    logPriceAlertDeliveryError({
      alertId,
      email: normalizedEmail,
      userId: normalizedUserId,
      phase: "web-push",
      message: pushStats?.skipReason || "WEB_PUSH_SEND_FAILED",
      details: {
        sent: pushStats.sent || 0,
        failed: pushStats.failed || 0,
        skipped: pushStats.skipped || 0,
      },
    });
  } else {
    console.log(
      "WEB_PUSH_SKIPPED",
      JSON.stringify({
        path: PRICE_ALERT_SINGLE_PATH,
        alertId,
        email: normalizedEmail || null,
        userId: normalizedUserId,
        reason: pushStats?.skipReason || "WEB_PUSH_NOT_SENT",
        sent: pushStats.sent || 0,
        failed: pushStats.failed || 0,
        skipped: pushStats.skipped || 0,
      })
    );
  }

  let emailResult = { success: false, sent: false, error: "EMAIL_NOT_ATTEMPTED" };

  console.log(
    "PRICE_ALERT_EMAIL_EVALUATED",
    JSON.stringify({
      path: PRICE_ALERT_SINGLE_PATH,
      alertId,
      email: normalizedEmail || null,
      userId: normalizedUserId,
      resendConfigured: Boolean(resendApiKey),
      delivery: delivery
        ? {
            email: delivery.email,
            emailCopyEnabled: delivery.emailCopyEnabled,
            emailChannelEnabled: delivery.emailChannelEnabled,
            blockedReason: delivery.blockedReason || null,
            dndActive: delivery.dndActive,
          }
        : null,
    })
  );

  if (!normalizedEmail) {
    emailResult = {
      success: false,
      sent: false,
      skipped: true,
      reason: "MISSING_RECIPIENT_EMAIL",
    };
  } else if (!delivery?.email) {
    console.log(
      "PRICE_ALERT_EMAIL_SKIPPED_BY_SETTINGS",
      JSON.stringify({
        path: PRICE_ALERT_SINGLE_PATH,
        alertId,
        email: normalizedEmail,
        userId: normalizedUserId,
        reason: delivery?.blockedReason || "EMAIL_BLOCKED_BY_SETTINGS",
        emailCopyEnabled: delivery?.emailCopyEnabled ?? null,
        emailChannelEnabled: delivery?.emailChannelEnabled ?? null,
      })
    );

    emailResult = {
      success: false,
      sent: false,
      skipped: true,
      reason: delivery?.blockedReason || "EMAIL_BLOCKED_BY_SETTINGS",
    };
    await finalizeChannelDelivery(supabase, {
      alertId,
      channel: "email",
      status: "skipped",
      errorCodeSafe: emailResult.reason,
    });
  } else {
    const emailGate = await beginChannelDelivery(supabase, { alertId, channel: "email" });
    if (emailGate.skipped && emailGate.reason === "already_sent") {
      emailResult = { success: true, sent: true, skipped: false, existing: true };
      incrementMetric("emailsSent");
    } else if (emailGate.proceed) {
      summary.emailsQueued += 1;
      incrementMetric("emailsQueued");

      console.log(
        "PRICE_ALERT_EMAIL_SEND_START",
        JSON.stringify({
          path: PRICE_ALERT_SINGLE_PATH,
          alertId,
          email: normalizedEmail,
          userId: normalizedUserId,
        })
      );

      try {
        emailResult = await sendPriceAlertEmail({
          supabase,
          resendApiKey,
          email: normalizedEmail,
          coinLabel: escapeHtml(formatCoinPair(coin)),
          conditionLabel: escapeHtml(getConditionLabel(condition)),
          targetPrice: escapeHtml(formatNumber(targetPrice)),
          currentPrice: escapeHtml(formatNumber(currentPrice)),
          alertId,
          userId: normalizedUserId,
        });

        if (emailResult?.sent) {
          await finalizeChannelDelivery(supabase, {
            alertId,
            channel: "email",
            status: "sent",
            providerMessageId: emailResult.resendId || null,
          });
          incrementMetric("emailsSent");
          console.log(
            "PRICE_ALERT_EMAIL_SENT",
            JSON.stringify({
              path: PRICE_ALERT_SINGLE_PATH,
              alertId,
              email: normalizedEmail,
              userId: normalizedUserId,
              resendId: emailResult.resendId || null,
            })
          );
        } else if (!emailResult?.skipped) {
          await finalizeChannelDelivery(supabase, {
            alertId,
            channel: "email",
            status: "failed",
            errorCodeSafe: emailResult?.reason || emailResult?.error || "EMAIL_SEND_FAILED",
          });
          incrementMetric("deliveryPartialFailures");
          console.log(
            "PRICE_ALERT_EMAIL_ERROR",
            JSON.stringify({
              path: PRICE_ALERT_SINGLE_PATH,
              alertId,
              email: normalizedEmail,
              userId: normalizedUserId,
              reason: emailResult?.reason || emailResult?.error || "EMAIL_SEND_FAILED",
              status: emailResult?.status || null,
            })
          );
        } else {
          await finalizeChannelDelivery(supabase, {
            alertId,
            channel: "email",
            status: "skipped",
            errorCodeSafe: emailResult?.reason || "EMAIL_SKIPPED",
          });
        }
      } catch (error) {
        await finalizeChannelDelivery(supabase, {
          alertId,
          channel: "email",
          status: "failed",
          errorCodeSafe: error?.message || "EMAIL_SEND_FAILED",
        });
        incrementMetric("deliveryPartialFailures");
        console.log(
          "PRICE_ALERT_EMAIL_ERROR",
          JSON.stringify({
            path: PRICE_ALERT_SINGLE_PATH,
            alertId,
            email: normalizedEmail,
            userId: normalizedUserId,
            message: error?.message || String(error),
          })
        );

        logPriceAlertDeliveryError({
          alertId,
          email: normalizedEmail,
          userId: normalizedUserId,
          phase: "email",
          message: error?.message || String(error),
        });

        emailResult = {
          success: false,
          sent: false,
          error: error?.message || String(error),
        };
      }

      if (!emailResult?.sent && !emailResult?.skipped && !emailResult?.existing) {
        logPriceAlertDeliveryError({
          alertId,
          email: normalizedEmail,
          userId: normalizedUserId,
          phase: "email",
          message: emailResult?.error || emailResult?.reason || "EMAIL_SEND_FAILED",
          details: {
            status: emailResult?.status || null,
          },
        });
      }
    }
  }

  return {
    emailResult,
    siteNotification,
    pushStats,
  };
}

const shouldTriggerAlert = ({ condition, targetPrice, currentPrice }) =>
  evaluatePriceAlertCondition({ condition, targetPrice, currentPrice }).triggered;

async function checkPriceAlerts() {
  if (!isPriceAlertWorkerEnabled()) {
    return;
  }

  if (priceAlertCheckInProgress) {
    logWorkerEvent("ALERT_CHECK_SKIPPED", {
      worker: WORKER_ENTRY,
      moduleVersion: PRICE_ALERTS_MODULE_VERSION,
      reason: "PREVIOUS_CHECK_IN_PROGRESS",
    });
    return;
  }

  priceAlertCheckInProgress = true;
  markCycleStart();
  const runId = createRunId();
  const cycleStartedAt = Date.now();
  const cycleStartedIso = new Date(cycleStartedAt).toISOString();
  let distributedOwner = null;

  const cycleStats = {
    alertsFetched: 0,
    alertsEvaluated: 0,
    alertsTriggered: 0,
    alertsClaimed: 0,
    alertsCompleted: 0,
    siteSent: 0,
    pushSent: 0,
    pushFailed: 0,
    emailQueued: 0,
    emailFailed: 0,
    duplicateClaims: 0,
    stalePrices: 0,
  };

  try {
    const distributedLock = await acquireDistributedCycleLock(getSupabaseClient);
    if (!distributedLock.acquired) {
      await persistCycleTelemetry(
        getSupabaseClient,
        buildCycleTelemetryRow({
          runId,
          startedAt: cycleStartedIso,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - cycleStartedAt,
          status: "overlap",
          stats: cycleStats,
          lock: { acquired: false, contended: true },
        })
      );
      markCycleFailed(Date.now() - cycleStartedAt);
      return;
    }
    distributedOwner = distributedLock.owner;

    logWorkerEvent("ALERT_CHECK_STARTED", {
      worker: WORKER_ENTRY,
      moduleVersion: PRICE_ALERTS_MODULE_VERSION,
      timestamp: cycleStartedIso,
      intervalMs: CHECK_INTERVAL_MS,
      runId,
    });

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

    const { data: alerts, error } = await supabase
      .from("price_alerts")
      .select(PRICE_ALERT_WORKER_COLUMNS)
      .eq("status", "active")
      .limit(MAX_ALERTS_PER_RUN);

    if (error) {
      throw new Error(error.message);
    }

    cycleStats.alertsFetched = alerts?.length || 0;
    incrementMetric("alertsFetched", cycleStats.alertsFetched);

    if (!alerts || alerts.length === 0) {
      await persistCycleTelemetry(
        getSupabaseClient,
        buildCycleTelemetryRow({
          runId,
          startedAt: cycleStartedIso,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - cycleStartedAt,
          status: "success",
          stats: cycleStats,
          lock: { acquired: true, contended: false },
        })
      );
      markCycleSuccess(Date.now() - cycleStartedAt, getCycleMetrics());
      logWorkerEvent("ALERT_CHECK_FINISHED", { ...summary, worker: WORKER_ENTRY });
      return;
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
    const priceQuotes = await fetchOkxPricesByCoin([...alertsByCoin.keys()]);
    const triggeredItems = [];

    for (const [coin, coinAlerts] of alertsByCoin.entries()) {
      const quote = priceQuotes.get(coin);
      if (!quote?.ok) {
        if (quote?.reason === "stale_price") {
          cycleStats.stalePrices += 1;
          incrementMetric("stalePrices");
        }
        logWorkerEvent("ALERT_COIN_CHECK_FAILED", {
          worker: WORKER_ENTRY,
          coin,
          error: quote?.reason || "missing_price",
        });
        continue;
      }

      const currentPrice = quote.price;

      for (const alert of coinAlerts) {
        cycleStats.alertsEvaluated += 1;
        incrementMetric("alertsEvaluated");

        const targetPrice = Number(alert.target_price);
        const condition = normalizeCondition(alert.condition);
        const userEmail = String(alert.user_email || "").trim().toLowerCase();

        if (!userEmail || !Number.isFinite(targetPrice)) {
          summary.skippedInvalid += 1;
          continue;
        }

        const evaluation = evaluatePriceAlertCondition({
          condition,
          targetPrice,
          currentPrice,
        });

        if (!evaluation.triggered) {
          continue;
        }

        cycleStats.alertsTriggered += 1;
        incrementMetric("alertsTriggered");

        logWorkerEvent("PRICE_ALERT_TRIGGERED", {
          worker: WORKER_ENTRY,
          alertId: alert.id,
          coin: formatCoinPair(coin),
          targetPrice,
          currentPrice,
          condition,
          reason: evaluation.reason,
        });

        const claim = await claimActivePriceAlert(supabase, {
          alertId: alert.id,
          triggeredPrice: currentPrice,
          runId,
        });

        if (!claim.claimed) {
          if (claim.duplicate) {
            cycleStats.duplicateClaims += 1;
            incrementMetric("duplicateClaimsRejected");
          }
          logWorkerEvent("ALERT_ALREADY_CLAIMED", {
            worker: WORKER_ENTRY,
            alertId: alert.id,
            reason: claim.reason,
          });
          continue;
        }

        cycleStats.alertsClaimed += 1;
        incrementMetric("alertsClaimed");
        summary.alertsUpdated += 1;
        summary.triggered += 1;

        const notificationMessage = buildPriceAlertNotificationMessage({
          coin,
          targetPrice,
          currentPrice,
          condition,
        });

        try {
          await deliverRealPriceAlert({
            summary,
            alertId: alert.id,
            userEmail,
            userId: null,
            coin,
            condition,
            targetPrice,
            currentPrice,
            notificationMessage,
          });
          cycleStats.alertsCompleted += 1;
          incrementMetric("alertsCompleted");
        } catch (dispatchError) {
          incrementMetric("deliveryPartialFailures");
          logPriceAlertDeliveryError({
            alertId: alert.id,
            email: userEmail,
            userId: null,
            phase: "deliverRealPriceAlert",
            message: dispatchError?.message || String(dispatchError),
          });
        }

        triggeredItems.push({ alertId: alert.id, coin });
      }
    }

    cycleStats.siteSent = getCycleMetrics().siteNotificationsSent;
    cycleStats.pushSent = getCycleMetrics().pushSent;
    cycleStats.pushFailed = getCycleMetrics().pushFailed;
    cycleStats.emailQueued = getCycleMetrics().emailsQueued;

    await persistCycleTelemetry(
      getSupabaseClient,
      buildCycleTelemetryRow({
        runId,
        startedAt: cycleStartedIso,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - cycleStartedAt,
        status: "success",
        stats: cycleStats,
        lock: { acquired: true, contended: false },
      })
    );

    markCycleSuccess(Date.now() - cycleStartedAt);
    logWorkerEvent("ALERT_CHECK_FINISHED", {
      ...summary,
      worker: WORKER_ENTRY,
      triggeredItems,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    await persistCycleTelemetry(
      getSupabaseClient,
      buildCycleTelemetryRow({
        runId,
        startedAt: cycleStartedIso,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - cycleStartedAt,
        status: "failed",
        stats: cycleStats,
        lock: { acquired: Boolean(distributedOwner), contended: false },
        errorCodeSafe: error?.message || "CYCLE_FAILED",
      })
    );
    markCycleFailed(Date.now() - cycleStartedAt);
    logWorkerEvent("ALERT_CHECK_FAILED", {
      worker: WORKER_ENTRY,
      error: error?.message || String(error),
    });
  } finally {
    if (distributedOwner) {
      await releaseDistributedCycleLock(getSupabaseClient, distributedOwner);
    }
    priceAlertCheckInProgress = false;
  }
}

app.get("/health", async (_req, res) => {
  const vapidStatus = getVapidEnvStatus();
  const { getWorkerAuthMetrics } = require("./worker-security");
  const envValidation = validatePriceAlertsEnvironment();
  const readiness = envValidation.ok && isPriceAlertWorkerEnabled();
  const lockMetrics = getDistributedLockMetrics();
  const cycleMetrics = getCycleMetrics();

  const body = {
    success: readiness,
    status: readiness ? "online" : "misconfigured",
    readiness,
    service: "hasan-chart-price-alerts-worker",
    runtimeMode: process.env.NODE_ENV || "production",
    workerEnabled: isPriceAlertWorkerEnabled(),
    checkIntervalMs: CHECK_INTERVAL_MS,
    maxAlertsPerRun: MAX_ALERTS_PER_RUN,
    currentCycleInFlight: cycleMetrics.currentCycleInFlight,
    environmentValidation: {
      ok: envValidation.ok,
      missingRequiredCount: envValidation.missingRequiredCount,
      invalidRequiredCount: envValidation.invalidRequiredCount,
    },
    dependencies: envValidation.dependencies,
    metrics: {
      ...cycleMetrics,
      distributedLockAcquired: lockMetrics.distributedLockAcquired,
      distributedLockContended: lockMetrics.distributedLockContended,
      distributedLockRecovered: lockMetrics.distributedLockRecovered,
      distributedLockErrors: lockMetrics.distributedLockErrors,
    },
    build: {
      commit: process.env.RAILWAY_GIT_COMMIT_SHA
        ? process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7)
        : null,
    },
    workerEntry: WORKER_ENTRY,
    priceAlertsModuleVersion: PRICE_ALERTS_MODULE_VERSION,
    webPushConfigured: vapidStatus.configured,
    workerHttpAuth: getWorkerAuthMetrics(),
    timestamp: new Date().toISOString(),
  };

  res.status(readiness ? 200 : 503).json(body);
});

app.post(
  "/api/instant-analysis",
  workerAccessDeniedMiddleware,
  instantAnalysisRateLimitMiddleware,
  async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.body?.symbol);

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: "رمز العملة مطلوب",
      });
    }

    const { resolveExecutionTimeframeInput } = require("./lib/instant-analysis-v2/constants");
    const timeframeResolution = resolveExecutionTimeframeInput(
      req.body?.executionTimeframe || req.body?.timeframe
    );

    if (!timeframeResolution.ok) {
      return res.status(400).json({
        success: false,
        code: timeframeResolution.code,
        error: timeframeResolution.message,
      });
    }

    const resolvedExecutionTimeframe = timeframeResolution.key;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    analysisJobs.set(jobId, {
      id: jobId,
      status: "processing",
      symbol,
      createdAt: new Date().toISOString(),
    });

    process.nextTick(async () => {
      try {
        const { runInstantAnalysisV2 } = require("./lib/instant-analysis-v2/pipeline");
        const { normalizeV2ToV1Legacy } = require("./lib/instant-analysis-v2/normalize-v1");

        const v2Result = await runInstantAnalysisV2({
          symbol,
          analysisId: jobId,
          fetchCandles: getMarketCandles,
          fetchPrice: getMarketPrice,
          openaiApiKey,
          executionTimeframe: resolvedExecutionTimeframe,
        });

        const analysis = normalizeV2ToV1Legacy(v2Result);

        analysisJobs.set(jobId, {
          id: jobId,
          status: "completed",
          result: analysis,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        analysisJobs.set(jobId, {
          id: jobId,
          status: "failed",
          error: error?.message || "ANALYSIS_FAILED",
          failedAt: new Date().toISOString(),
        });
      }
    });

    return res.json({
      success: true,
      queued: true,
      jobId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "SERVER_ERROR",
    });
  }
  }
);

app.get(
  "/api/instant-analysis/:jobId",
  workerAccessDeniedMiddleware,
  async (req, res) => {
  try {
    const jobId = String(req.params?.jobId || "").trim();

    const job = analysisJobs.get(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "JOB_NOT_FOUND",
      });
    }

    return res.json({
      success: true,
      ...job,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "SERVER_ERROR",
    });
  }
  }
);

app.listen(PORT, () => {
  const vapidStatus = getVapidEnvStatus();

  if (!vapidStatus.configured) {
    console.log("push:vapid:missing", {
      worker: WORKER_ENTRY,
      ...vapidStatus,
      hint: "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT on Railway worker",
    });
  } else {
    console.log("push:vapid:ready", {
      worker: WORKER_ENTRY,
      hasPublicKey: vapidStatus.hasPublicKey,
      hasPrivateKey: vapidStatus.hasPrivateKey,
      hasSubject: vapidStatus.hasSubject,
      subjectPreview: vapidStatus.subjectPreview,
    });
  }

  logWorkerEvent("PRICE_ALERT_WORKER_STARTED", {
    worker: WORKER_ENTRY,
    service: "hasan-chart-price-alerts-worker",
    moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    port: PORT,
    checkIntervalMs: CHECK_INTERVAL_MS,
    priceAlertsEnabled: true,
    webPushConfigured: vapidStatus.configured,
    vapidStatus,
    note: "Price alert delivery: worker/index.js deliverRealPriceAlert (notification + push + email)",
  });

  logWorkerEvent("WORKER_BOOT", {
    worker: WORKER_ENTRY,
    service: "hasan-chart-price-alerts-worker",
    moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    port: PORT,
    checkIntervalMs: CHECK_INTERVAL_MS,
    priceAlertsEnabled: true,
    priceAlertSinglePath: PRICE_ALERT_SINGLE_PATH,
    note: "Price alerts: worker/index.js deliverRealPriceAlert only",
  });

  console.log(
    "PRICE_ALERT_SINGLE_PATH",
    JSON.stringify({
      phase: "worker-listening",
      path: PRICE_ALERT_SINGLE_PATH,
      port: PORT,
      checkIntervalMs: CHECK_INTERVAL_MS,
      moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    })
  );

  cleanupOldRuns(getSupabaseClient)
    .then((result) => {
      if (result.ok) {
        console.log(
          "PRICE_ALERT_TELEMETRY_CLEANUP",
          JSON.stringify({ deleted: result.deleted, retentionDays: result.retentionDays })
        );
      }
    })
    .catch(() => {});

  if (isPriceAlertWorkerEnabled()) {
    setInterval(checkPriceAlerts, CHECK_INTERVAL_MS);
    checkPriceAlerts();
  }

  logWorkerEvent("PRICE_ALERTS_SCHEDULER_STARTED", {
    worker: WORKER_ENTRY,
    moduleVersion: PRICE_ALERTS_MODULE_VERSION,
    intervalMs: CHECK_INTERVAL_MS,
    priceAlertSinglePath: PRICE_ALERT_SINGLE_PATH,
    enabled: isPriceAlertWorkerEnabled(),
  });
});

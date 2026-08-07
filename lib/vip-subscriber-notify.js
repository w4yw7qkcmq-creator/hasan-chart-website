import { getSiteUrl } from "./email.js";
import { buildVipSignalEmailContent } from "./email-layout.js";
import { dispatchUnifiedSiteAlerts } from "./site-notification-dispatch.js";
import { dispatchVipSignalEmail } from "./vip-signal-email-dispatch.js";
import {
  extractEligibleEmailsFromProfileRows,
  extractEligibleEmailsFromSubscriptionRows,
  getVipSignalPagePath,
  getVipSiteNotificationType,
  isActiveSubscriptionRow,
  matchesSignalSubscription,
  normalizeVipSignalType,
  signalTypeLabel,
} from "./vip-recommendation-eligibility.js";

export {
  extractEligibleEmailsFromProfileRows,
  extractEligibleEmailsFromSubscriptionRows,
  isActiveSubscriptionRow,
  matchesSignalSubscription,
  normalizeVipSignalType,
  signalTypeLabel,
};

export const VIP_NOTIFICATION_BATCH_SIZE = 100;

const SUBSCRIPTION_BATCH_SELECT =
  "id,user_email,plan_name,category,status,expires_at,created_at";
const PROFILE_BATCH_SELECT =
  "id,email,subscription_plan,subscription_status,created_at";

function createEmptySummary() {
  return {
    totalEligible: 0,
    processed: 0,
    notificationsCreated: 0,
    skipped: 0,
    failed: 0,
    batches: 0,
    durationMs: 0,
    success: true,
    partial: false,
    batchErrors: [],
  };
}

function logVipNotifyEvent(event, payload = {}) {
  console.info(event, payload);
}

async function fetchSubscriptionRequestBatch(supabase, offset, batchSize) {
  const from = offset;
  const to = offset + batchSize - 1;

  return supabase
    .from("subscription_requests")
    .select(SUBSCRIPTION_BATCH_SELECT)
    .eq("status", "مفعل")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
}

async function fetchProfilesBatch(supabase, offset, batchSize) {
  const from = offset;
  const to = offset + batchSize - 1;

  return supabase
    .from("profiles")
    .select(PROFILE_BATCH_SELECT)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
}

async function dispatchVipSignalToRecipient(
  supabase,
  {
    email,
    signalId,
    normalizedSignalType,
    coin,
    entry,
    targets,
    stopLoss,
    notes,
    notificationTitle,
    notificationMessage,
    subject,
    signalPagePath,
    siteType,
    signalPageUrl,
    emailContent,
  },
  deps = {}
) {
  const dispatchEmail = deps.dispatchVipSignalEmail || dispatchVipSignalEmail;
  const dispatchAlerts = deps.dispatchUnifiedSiteAlerts || dispatchUnifiedSiteAlerts;

  try {
    const emailResult = await dispatchEmail({
      signalId: signalId || null,
      recipientEmail: email,
      signalType: normalizedSignalType,
      coin,
      subject,
      title: notificationTitle,
      content: emailContent,
      actionText: "فتح صفحة التوصيات",
      actionUrl: signalPageUrl,
    });

    const alertResult = await dispatchAlerts(supabase, {
      preset: "vip_signal",
      userEmail: email,
      title: notificationTitle,
      message: notificationMessage,
      type: siteType,
      url: signalPagePath,
      metadata: {
        signalId: signalId || null,
        signalType: normalizedSignalType,
        coin,
        notification_key: "vip_signal",
      },
    });

    const notificationCreated = Boolean(alertResult.notificationCreated);
    const skipped =
      !notificationCreated &&
      !emailResult?.sent &&
      !emailResult?.queued &&
      !emailResult?.duplicate;

    return {
      ok: true,
      notificationCreated,
      skipped,
      failed: false,
      emailResult,
      alertResult,
    };
  } catch (error) {
    return {
      ok: false,
      notificationCreated: false,
      skipped: false,
      failed: true,
      error,
    };
  }
}

async function processRecipientBatch(supabase, emails, dispatchContext, deps = {}) {
  const batchStats = {
    processed: 0,
    notificationsCreated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const email of emails) {
    const result = await dispatchVipSignalToRecipient(supabase, {
      ...dispatchContext,
      email,
    }, deps);

    batchStats.processed += 1;

    if (result.failed) {
      batchStats.failed += 1;
      continue;
    }

    if (result.notificationCreated) {
      batchStats.notificationsCreated += 1;
    } else if (result.skipped) {
      batchStats.skipped += 1;
    }
  }

  return batchStats;
}

async function paginateSource({
  supabase,
  source,
  fetchBatch,
  extractEmails,
  signalType,
  seenEmails,
  summary,
  dispatchContext,
  batchSize,
  deps = {},
}) {
  let offset = 0;
  let batchNumber = 0;

  while (true) {
    batchNumber += 1;
    const batchStartedAt = Date.now();

    logVipNotifyEvent("VIP_NOTIFY_BATCH_STARTED", {
      source,
      batchNumber,
      offset,
      batchSize,
    });

    const { data, error } = await fetchBatch(supabase, offset, batchSize);
    const fetchedCount = Array.isArray(data) ? data.length : 0;

    if (error) {
      summary.success = false;
      summary.partial = summary.processed > 0 || summary.batches > 0;
      summary.batchErrors.push({
        source,
        batchNumber,
        message: String(error.message || error),
      });

      logVipNotifyEvent("VIP_NOTIFY_FAILED", {
        source,
        batchNumber,
        fetchedCount: 0,
        durationMs: Date.now() - batchStartedAt,
      });

      break;
    }

    if (fetchedCount === 0) {
      logVipNotifyEvent("VIP_NOTIFY_BATCH_FINISHED", {
        source,
        batchNumber,
        fetchedCount: 0,
        eligibleCount: 0,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        durationMs: Date.now() - batchStartedAt,
      });
      break;
    }

    const eligibleEmails = extractEmails(data, signalType, seenEmails);
    summary.totalEligible += eligibleEmails.length;

    let batchStats = {
      processed: 0,
      notificationsCreated: 0,
      skipped: 0,
      failed: 0,
    };

    if (eligibleEmails.length > 0) {
      batchStats = await processRecipientBatch(supabase, eligibleEmails, dispatchContext, deps);
    }

    summary.batches += 1;
    summary.processed += batchStats.processed;
    summary.notificationsCreated += batchStats.notificationsCreated;
    summary.skipped += batchStats.skipped;
    summary.failed += batchStats.failed;

    if (batchStats.failed > 0) {
      summary.partial = true;
    }

    logVipNotifyEvent("VIP_NOTIFY_BATCH_FINISHED", {
      source,
      batchNumber,
      fetchedCount,
      eligibleCount: eligibleEmails.length,
      createdCount: batchStats.notificationsCreated,
      skippedCount: batchStats.skipped,
      failedCount: batchStats.failed,
      durationMs: Date.now() - batchStartedAt,
    });

    if (fetchedCount < batchSize) {
      break;
    }

    offset += batchSize;
  }
}

/**
 * Notify VIP subscribers in DB-level batches (sequential).
 * Preserves existing notification content, dispatch paths, and eligibility rules.
 */
export async function notifyVipSubscribers(supabase, signal, options = {}) {
  const startedAt = Date.now();
  const summary = createEmptySummary();
  const batchSize = Number(options.batchSize) > 0 ? Number(options.batchSize) : VIP_NOTIFICATION_BATCH_SIZE;
  const deps = {
    dispatchVipSignalEmail: options.dispatchVipSignalEmail,
    dispatchUnifiedSiteAlerts: options.dispatchUnifiedSiteAlerts,
  };

  try {
    const { signalType, coin, entry, targets, stopLoss, notes, signalId } = signal;
    const normalizedSignalType = normalizeVipSignalType(signalType);
    const label = signalTypeLabel(normalizedSignalType);

    const signalPagePath = getVipSignalPagePath(normalizedSignalType);
    const siteType = getVipSiteNotificationType(normalizedSignalType);
    const notificationTitle =
      normalizedSignalType === "forex"
        ? "💱 توصية فوركس جديدة"
        : `🚨 توصية VIP ${label} جديدة`;
    const notificationMessage =
      normalizedSignalType === "forex"
        ? `تم نشر توصية جديدة على ${coin}. افتح صفحة توصيات Forex للاطلاع على التفاصيل.`
        : `تم نشر توصية جديدة على ${coin}. افتح صفحة توصيات VIP ${label} للاطلاع على التفاصيل.`;
    const subject = `${notificationTitle} - ${coin}`;
    const signalPageUrl = `${getSiteUrl()}${signalPagePath}`;
    const emailContent = buildVipSignalEmailContent({
      coin,
      entry,
      targets,
      stopLoss,
      notes,
    });

    const dispatchContext = {
      signalId: signalId || null,
      normalizedSignalType,
      coin,
      entry,
      targets,
      stopLoss,
      notes,
      notificationTitle,
      notificationMessage,
      subject,
      signalPagePath,
      siteType,
      signalPageUrl,
      emailContent,
    };

    const seenEmails = new Set();

    await paginateSource({
      supabase,
      source: "subscription_requests",
      fetchBatch: fetchSubscriptionRequestBatch,
      extractEmails: extractEligibleEmailsFromSubscriptionRows,
      signalType: normalizedSignalType,
      seenEmails,
      summary,
      dispatchContext,
      batchSize,
      deps,
    });

    await paginateSource({
      supabase,
      source: "profiles",
      fetchBatch: fetchProfilesBatch,
      extractEmails: extractEligibleEmailsFromProfileRows,
      signalType: normalizedSignalType,
      seenEmails,
      summary,
      dispatchContext,
      batchSize,
      deps,
    });

    if (summary.batchErrors.length > 0 && summary.processed === 0 && summary.totalEligible === 0) {
      summary.success = false;
    } else if (summary.failed > 0 || summary.batchErrors.length > 0) {
      summary.partial = true;
    }

    summary.durationMs = Date.now() - startedAt;

    logVipNotifyEvent("VIP_NOTIFY_COMPLETED", {
      signalType: normalizedSignalType,
      totalEligible: summary.totalEligible,
      processed: summary.processed,
      notificationsCreated: summary.notificationsCreated,
      skipped: summary.skipped,
      failed: summary.failed,
      batches: summary.batches,
      partial: summary.partial,
      success: summary.success,
      durationMs: summary.durationMs,
    });

    return summary;
  } catch (error) {
    summary.success = false;
    summary.partial = summary.processed > 0;
    summary.durationMs = Date.now() - startedAt;
    summary.batchErrors.push({
      source: "notifyVipSubscribers",
      message: String(error?.message || error),
    });

    logVipNotifyEvent("VIP_NOTIFY_FAILED", {
      processed: summary.processed,
      durationMs: summary.durationMs,
      message: String(error?.message || error),
    });

    return summary;
  }
}

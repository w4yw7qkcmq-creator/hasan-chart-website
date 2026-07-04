import {
  getNotificationHref,
  getNotificationIcon,
  getNotificationVisualType,
  normalizeNotification,
} from "./notifications-shared.js";
import { normalizeNotificationKey, NOTIFICATION_SOUND_KEYS } from "./notification-sound-keys.js";
import { playNotificationSound, unlockNotificationSound } from "./notification-sound-manager.js";
import {
  parseNotificationRow,
  resolveNotificationEventUrl,
  resolveSiteTypeForNotificationKey,
} from "./notification-center-shared.js";
import { emitNotificationHubUpsert } from "./notification-hub-events.js";

const DEFAULT_BRIDGE = {
  showToast: null,
  registerNotification: null,
  isAuthenticated: null,
  shouldSkipToast: null,
  bumpBell: null,
};

let bridgeHandlers = { ...DEFAULT_BRIDGE };
const renderedNotificationIds = new Set();
const notificationSoundPlayedIds = new Set();

function logNotificationCenter(event, extra = {}) {
  if (Object.keys(extra).length > 0) {
    console.log(event, extra);
    return;
  }

  console.log(event);
}

function isPriceAlertNotificationKey(key) {
  return normalizeNotificationKey(key) === NOTIFICATION_SOUND_KEYS.PRICE_ALERT;
}

function logPriceAlertStage(event, extra = {}) {
  if (Object.keys(extra).length > 0) {
    console.log(event, extra);
    return;
  }

  console.log(event);
}

export function registerNotificationCenterBridge(handlers = {}) {
  bridgeHandlers = {
    ...bridgeHandlers,
    ...handlers,
  };
}

export function unregisterNotificationCenterBridge() {
  bridgeHandlers = { ...DEFAULT_BRIDGE };
  renderedNotificationIds.clear();
  notificationSoundPlayedIds.clear();
}

export function markNotificationSoundPlayed(id) {
  if (!id) return;
  notificationSoundPlayedIds.add(String(id));
}

export function hasNotificationSoundPlayed(id) {
  if (!id) return false;
  return notificationSoundPlayedIds.has(String(id));
}

export function markNotificationCenterRendered(id) {
  if (!id) return;
  renderedNotificationIds.add(String(id));
}

export function isNotificationCenterRendered(id) {
  if (!id) return false;
  return renderedNotificationIds.has(String(id));
}

export function clearNotificationCenterRendered() {
  renderedNotificationIds.clear();
  notificationSoundPlayedIds.clear();
}

function buildClientNotificationFromEvent(event) {
  const resolvedUrl = resolveNotificationEventUrl(event);
  const siteType = event.siteType || resolveSiteTypeForNotificationKey(event.notificationKey, event.metadata);

  const normalizedFromRow = normalizeNotification({
    id: event.id || event.metadata?.id || `nc-${Date.now()}`,
    user_email: event.metadata?.userEmail || event.metadata?.user_email || "",
    title: event.title,
    message: event.body,
    type: siteType,
    notification_key: event.notificationKey,
    url: resolvedUrl,
    metadata: event.metadata,
    is_read: false,
    created_at: event.metadata?.createdAt || event.metadata?.created_at || new Date().toISOString(),
  });

  if (!normalizedFromRow) {
    return {
      id: event.id || `nc-${Date.now()}`,
      title: event.title || "إشعار جديد",
      message: event.body || "",
      type: siteType,
      notificationKey: event.notificationKey,
      href: resolvedUrl,
      icon: getNotificationIcon(siteType),
      visualType: getNotificationVisualType(siteType),
      isRead: false,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    ...normalizedFromRow,
    notificationKey: event.notificationKey,
    href: resolvedUrl || normalizedFromRow.href || getNotificationHref(siteType),
  };
}

async function sendBrowserNotification(event) {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const url = resolveNotificationEventUrl(event);

  const notification = new Notification(event.title, {
    body: event.body,
    icon: "/favicon.png",
    tag: `notification-center-${event.notificationKey}-${event.id || Date.now()}`,
    data: { url },
  });

  notification.onclick = () => {
    window.focus();
    notification.close();

    if (url) {
      window.location.assign(url);
    }
  };

  return true;
}

async function attemptNotificationCenterSound(event, { source = "notification-center" } = {}) {
  const notificationId = event.id || event.metadata?.id || null;
  const alertId = event.metadata?.alertId ?? event.metadata?.alert_id ?? null;
  const soundPlayId = alertId || notificationId;
  const resolvedKey = normalizeNotificationKey(event.notificationKey);
  const isPriceAlert = isPriceAlertNotificationKey(resolvedKey);

  logNotificationCenter("NOTIFICATION_CENTER_SOUND_ATTEMPT", {
    id: notificationId,
    alertId: alertId || null,
    key: resolvedKey,
    rawKey: event.notificationKey,
    source,
    alreadyPlayed: hasNotificationSoundPlayed(notificationId),
  });

  if (isPriceAlert) {
    logPriceAlertStage("PRICE_ALERT_SOUND_REQUEST", {
      id: notificationId,
      alertId: alertId || null,
      key: resolvedKey,
      source,
      alreadyPlayed: hasNotificationSoundPlayed(notificationId),
    });
  }

  if (notificationId && hasNotificationSoundPlayed(notificationId)) {
    logNotificationCenter("NOTIFICATION_SOUND_BLOCKED", {
      id: notificationId,
      key: resolvedKey,
      reason: "sound-already-played-for-id",
      source,
    });

    if (isPriceAlert) {
      logPriceAlertStage("PRICE_ALERT_SOUND_BLOCKED", {
        id: notificationId,
        alertId: alertId || null,
        reason: "sound-already-played-for-id",
        source,
      });
    }

    return false;
  }

  try {
    const result = await playNotificationSound(resolvedKey, {
      id: soundPlayId || `nc-${Date.now()}`,
      source,
      allowBackgroundPlayback: isPriceAlert,
    });

    if (result?.dispatched && notificationId) {
      markNotificationSoundPlayed(notificationId);
    }

    if (isPriceAlert && !result?.dispatched) {
      logPriceAlertStage("PRICE_ALERT_SOUND_BLOCKED", {
        id: notificationId,
        alertId: alertId || null,
        key: resolvedKey,
        reason: result?.blockedReason || "play-not-dispatched",
        source,
      });
    }

    return Boolean(result?.dispatched);
  } catch (error) {
    logNotificationCenter("NOTIFICATION_CENTER_ERROR", {
      channel: "sound",
      key: resolvedKey,
      id: notificationId,
      error: error?.message || String(error),
      source,
    });

    if (isPriceAlert) {
      logPriceAlertStage("PRICE_ALERT_SOUND_BLOCKED", {
        id: notificationId,
        alertId: alertId || null,
        reason: error?.message || String(error),
        source,
      });
    }

    return false;
  }
}

async function renderNotificationChannels(
  event,
  { source = "notification-center", skipSound = false, skipToast = false, skipBrowser = false } = {}
) {
  const clientNotification = buildClientNotificationFromEvent(event);
  const resolvedKey = normalizeNotificationKey(event.notificationKey);

  if (!skipSound) {
    await attemptNotificationCenterSound(event, { source });
  }

  const shouldSkipToast =
    skipToast || Boolean(bridgeHandlers.shouldSkipToast?.());

  if (!shouldSkipToast && typeof bridgeHandlers.showToast === "function") {
    try {
      bridgeHandlers.showToast(clientNotification);
    } catch (error) {
      logNotificationCenter("NOTIFICATION_CENTER_ERROR", {
        channel: "toast",
        key: event.notificationKey,
        id: event.id || null,
        error: error?.message || String(error),
      });
    }
  }

  if (!skipBrowser) {
    try {
      const sent = await sendBrowserNotification(event);

      if (sent) {
        logNotificationCenter("NOTIFICATION_CENTER_BROWSER_SENT", {
          key: event.notificationKey,
          id: event.id || null,
          url: resolveNotificationEventUrl(event),
        });
      }
    } catch (error) {
      logNotificationCenter("NOTIFICATION_CENTER_ERROR", {
        channel: "browser",
        key: event.notificationKey,
        id: event.id || null,
        error: error?.message || String(error),
      });
    }
  }

  if (typeof bridgeHandlers.bumpBell === "function") {
    try {
      bridgeHandlers.bumpBell();
    } catch (error) {
      logNotificationCenter("NOTIFICATION_CENTER_ERROR", {
        channel: "badge",
        key: event.notificationKey,
        id: event.id || null,
        error: error?.message || String(error),
      });
    }
  }

  return clientNotification;
}

async function persistNotificationToDatabase(event) {
  const response = await fetch("/api/notification-center/dispatch", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key: event.notificationKey,
      title: event.title,
      body: event.body,
      url: resolveNotificationEventUrl(event),
      type: event.siteType,
      metadata: event.metadata,
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || "Failed to persist notification");
  }

  return normalizeNotification(result.notification) || result.notification;
}

/**
 * Event-driven handler for notifications table INSERT / polling discoveries.
 * Does not call notify(); treats the row as the source event.
 */
export async function handleNotificationCenterRealtimeEvent(row, { source = "realtime" } = {}) {
  const event = parseNotificationRow(row);

  if (!event.id) {
    return { skipped: true, reason: "missing-id", event };
  }

  const resolvedKey = normalizeNotificationKey(event.notificationKey);

  logNotificationCenter("NOTIFICATION_CENTER_RECEIVED", {
    id: event.id,
    key: resolvedKey,
    rawKey: event.notificationKey,
    title: event.title,
    url: resolveNotificationEventUrl(event),
    source,
    metadata: event.metadata,
  });

  logNotificationCenter("NOTIFICATION_CENTER_REALTIME_RECEIVED", {
    id: event.id,
    key: resolvedKey,
    title: event.title,
    url: resolveNotificationEventUrl(event),
    source,
    metadata: event.metadata,
  });

  if (isPriceAlertNotificationKey(resolvedKey)) {
    logPriceAlertStage("PRICE_ALERT_REALTIME_RECEIVED", {
      id: event.id,
      key: resolvedKey,
      title: event.title,
      url: resolveNotificationEventUrl(event),
      source,
      metadata: event.metadata,
    });
  }

  emitNotificationHubUpsert(
    {
      ...row,
      id: event.id,
      title: event.title,
      message: event.body,
      notification_key: resolvedKey,
      url: resolveNotificationEventUrl(event),
      metadata: event.metadata,
      type: event.siteType,
      is_read: row.is_read ?? false,
      is_pinned: row.is_pinned ?? false,
      created_at: row.created_at || new Date().toISOString(),
    },
    { source: `notification-center:${source}` }
  );

  const isDuplicateRender = isNotificationCenterRendered(event.id);

  if (isDuplicateRender) {
    logNotificationCenter("NOTIFICATION_CENTER_REALTIME_SKIPPED_DUPLICATE", {
      id: event.id,
      key: resolvedKey,
      source,
    });

    if (isPriceAlertNotificationKey(resolvedKey)) {
      logPriceAlertStage("PRICE_ALERT_DUPLICATE_SKIPPED", {
        id: event.id,
        reason: "duplicate-render-already-shown",
        source,
        note: "toast-and-browser-skipped-sound-recovery-attempted",
      });
    }

    await attemptNotificationCenterSound(
      { ...event, notificationKey: resolvedKey },
      { source: `${source}:duplicate-recovery` }
    );

    return { skipped: true, reason: "duplicate", event, soundAttempted: true };
  }

  markNotificationCenterRendered(event.id);

  await renderNotificationChannels(
    { ...event, notificationKey: resolvedKey },
    { source }
  );

  logNotificationCenter("NOTIFICATION_CENTER_REALTIME_RENDERED", {
    id: event.id,
    key: resolvedKey,
    title: event.title,
    url: resolveNotificationEventUrl(event),
    source,
  });

  return { rendered: true, event };
}

/**
 * Manual/local entry point. Still supported for admin-only and test flows.
 * When persist=true, saves first then renders once and marks id for dedupe.
 */
export async function notify({
  key,
  title,
  body = "",
  url,
  priority = "normal",
  metadata = {},
  persist = true,
  skipSound = false,
  skipToast = false,
  skipBrowser = false,
  source = "notification-center",
} = {}) {
  const notificationKey = normalizeNotificationKey(key);
  const event = {
    id: String(metadata.id || metadata.notificationId || ""),
    notificationKey,
    title: String(title || "").trim() || "إشعار جديد",
    body: String(body || "").trim(),
    url: String(url || metadata.url || "").trim(),
    metadata: {
      ...metadata,
      type: resolveSiteTypeForNotificationKey(notificationKey, metadata),
    },
    siteType: resolveSiteTypeForNotificationKey(notificationKey, metadata),
    row: null,
  };

  logNotificationCenter("NOTIFICATION_CENTER_RECEIVED", {
    key: notificationKey,
    title: event.title,
    url: resolveNotificationEventUrl(event),
    priority,
    metadata,
    source,
    persist,
  });

  const shouldPersist =
    persist && typeof bridgeHandlers.isAuthenticated === "function"
      ? bridgeHandlers.isAuthenticated()
      : false;

  if (shouldPersist) {
    try {
      const persisted = await persistNotificationToDatabase(event);
      const persistedRow = {
        id: persisted.id,
        user_email: persisted.userEmail,
        title: persisted.title,
        message: persisted.message,
        type: persisted.type,
        notification_key: persisted.notificationKey || notificationKey,
        url: persisted.href || resolveNotificationEventUrl(event),
        metadata: persisted.metadata || event.metadata,
        is_read: persisted.isRead,
        created_at: persisted.createdAt,
      };

      const alreadyRendered = isNotificationCenterRendered(persisted.id);
      markNotificationCenterRendered(persisted.id);

      if (typeof bridgeHandlers.registerNotification === "function") {
        bridgeHandlers.registerNotification(persistedRow, {
          bumpUnread: true,
          animateList: true,
        });
      }

      logNotificationCenter("NOTIFICATION_CENTER_DB_SAVED", {
        key: notificationKey,
        id: persisted.id,
      });

      if (!alreadyRendered) {
        await renderNotificationChannels(parseNotificationRow(persistedRow), {
          source,
          skipSound,
          skipToast,
          skipBrowser,
        });
      }

      emitNotificationHubUpsert(persistedRow, { source: `notification-center:${source}` });

      return persisted;
    } catch (error) {
      logNotificationCenter("NOTIFICATION_CENTER_ERROR", {
        channel: "db",
        key: notificationKey,
        error: error?.message || String(error),
      });
    }
  }

  const localId = event.id || `nc-local-${Date.now()}`;
  event.id = localId;

  if (isNotificationCenterRendered(localId)) {
    logNotificationCenter("NOTIFICATION_CENTER_REALTIME_SKIPPED_DUPLICATE", {
      id: localId,
      key: notificationKey,
      source,
    });
    return buildClientNotificationFromEvent(event);
  }

  markNotificationCenterRendered(localId);

  const rendered = await renderNotificationChannels(event, {
    source,
    skipSound,
    skipToast,
    skipBrowser,
  });

  emitNotificationHubUpsert(
    {
      id: localId,
      title: event.title,
      message: event.body,
      notification_key: notificationKey,
      url: resolveNotificationEventUrl(event),
      metadata: event.metadata,
      type: event.siteType,
      is_read: false,
      is_pinned: false,
      created_at: new Date().toISOString(),
    },
    { source: `notification-center:${source}` }
  );

  return rendered;
}

export function installNotificationCenterTestHook() {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.testNotificationCenter = async (key = "price_alert") => {
    await unlockNotificationSound();

    return notify({
      key,
      title: "اختبار Notification Center",
      body: `تم إرسال إشعار تجريبي للنوع: ${key}`,
      persist: false,
      source: "notification-center-test-hook",
    });
  };

  return () => {
    delete window.testNotificationCenter;
  };
}

export {
  isNotificationCenterWiredKey,
  NOTIFICATION_CENTER_WIRED_KEYS,
  parseNotificationRow,
  resolveNotificationCenterKeyFromSiteType,
} from "./notification-center-shared.js";

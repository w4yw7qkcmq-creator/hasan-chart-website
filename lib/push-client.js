const ANONYMOUS_ID_KEY = "hc_push_anonymous_id";
const PUSH_ENDPOINT_KEY = "hc_push_endpoint";

export function getAnonymousPushId() {
  if (typeof window === "undefined") return "";

  let anonymousId = localStorage.getItem(ANONYMOUS_ID_KEY);

  if (!anonymousId) {
    anonymousId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    localStorage.setItem(ANONYMOUS_ID_KEY, anonymousId);
  }

  return anonymousId;
}

export function getStoredPushEndpoint() {
  if (typeof window === "undefined") return "";

  return localStorage.getItem(PUSH_ENDPOINT_KEY) || "";
}

export function setStoredPushEndpoint(endpoint) {
  if (typeof window === "undefined") return;

  if (endpoint) {
    localStorage.setItem(PUSH_ENDPOINT_KEY, endpoint);
    return;
  }

  localStorage.removeItem(PUSH_ENDPOINT_KEY);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function ensureServiceWorkerRegistration() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("SERVICE_WORKER_UNSUPPORTED");
  }

  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getExistingPushSubscription() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    await ensureServiceWorkerRegistration();
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

import {
  PUSH_ENROLLMENT,
  resolvePushEnrollmentFromBrowserState,
} from "./push-enrollment-state.js";
import { detectPushPlatformContext, detectWebPushCapabilities } from "./push-platform.js";

export function getWebPushCapabilities() {
  return detectWebPushCapabilities();
}

export async function resolvePushEnrollmentState() {
  const platform = detectPushPlatformContext();
  const {
    serviceWorkerSupported,
    pushManagerSupported,
    notificationSupported,
  } = platform;

  const browserState = await resolveBrowserPushState();

  const enrollment = resolvePushEnrollmentFromBrowserState({
    permission: browserState.permission,
    hasSubscription: browserState.hasSubscription,
    serviceWorkerSupported,
    pushManagerSupported,
    notificationSupported,
    needsHomeScreen: platform.isIOSBrowserTab,
  });

  return {
    ...browserState,
    enrollment,
    isEnrolled: enrollment === PUSH_ENROLLMENT.ENROLLED,
    needsReenable: enrollment === PUSH_ENROLLMENT.NEEDS_REENABLE,
    needsHomeScreen: enrollment === PUSH_ENROLLMENT.NEEDS_HOME_SCREEN,
    platform,
  };
}

export async function resolveBrowserPushState() {
  const permission =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default";

  console.log(
    "push:permission",
    JSON.stringify({
      permission,
    })
  );

  if (permission !== "granted") {
    console.log(
      "push:existing-subscription:missing",
      JSON.stringify({
        reason: "permission_not_granted",
      })
    );

    return {
      permission,
      hasSubscription: false,
      subscription: null,
    };
  }

  const subscription = await getExistingPushSubscription();

  if (subscription) {
    console.log(
      "push:existing-subscription:found",
      JSON.stringify({
        hasEndpoint: Boolean(subscription.endpoint),
      })
    );
  } else {
    console.log(
      "push:existing-subscription:missing",
      JSON.stringify({
        reason: "no_push_subscription",
      })
    );
  }

  return {
    permission,
    hasSubscription: Boolean(subscription),
    subscription,
  };
}

export async function subscribeToWebPush() {
  if (typeof window === "undefined" || !("PushManager" in window)) {
    throw new Error("PUSH_MANAGER_UNSUPPORTED");
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

  if (!publicKey) {
    throw new Error("MISSING_VAPID_PUBLIC_KEY");
  }

  const registration = await ensureServiceWorkerRegistration();
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  return subscription;
}

export async function unsubscribeFromWebPush() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.getRegistration("/");

  if (!registration) {
    return null;
  }

  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return null;
  }

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  setStoredPushEndpoint("");
  return endpoint;
}

export function serializePushSubscription(subscription) {
  const json = subscription.toJSON();

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime || null,
    keys: {
      p256dh: json.keys?.p256dh || "",
      auth: json.keys?.auth || "",
    },
  };
}

export async function savePushSubscriptionViaApi({
  subscription,
  userId = null,
  userEmail = null,
  anonymousId = null,
} = {}) {
  const normalizedUserId = userId ? String(userId).trim() : null;
  const normalizedUserEmail = userEmail ? String(userEmail).trim().toLowerCase() : null;

  console.log(
    "push:client:start",
    JSON.stringify({
      hasEndpoint: Boolean(subscription?.endpoint),
      hasP256dh: Boolean(subscription?.keys?.p256dh),
      hasAuth: Boolean(subscription?.keys?.auth),
      userId: normalizedUserId,
      userEmail: normalizedUserEmail,
      anonymousId: anonymousId ? String(anonymousId).trim() : null,
    })
  );

  if (!normalizedUserId || !normalizedUserEmail) {
    console.error(
      "push:api:error",
      JSON.stringify({
        phase: "client",
        reason: "MISSING_AUTH_USER",
        userId: normalizedUserId,
        userEmail: normalizedUserEmail,
      })
    );

    throw new Error("يجب تسجيل الدخول قبل حفظ اشتراك الإشعارات");
  }

  const payload = {
    subscription,
    userId: normalizedUserId,
    userEmail: normalizedUserEmail,
    anonymousId: anonymousId ? String(anonymousId).trim() : null,
  };

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success || !result?.subscription?.id) {
    console.error(
      "push:api:error",
      JSON.stringify({
        phase: "client",
        status: response.status,
        error: result?.error || null,
      })
    );

    throw new Error(
      result?.error ||
        (response.ok ? "لم يتم حفظ الاشتراك في قاعدة البيانات" : `HTTP ${response.status}`)
    );
  }

  console.log(
    "push:api:success",
    JSON.stringify({
      phase: "client",
      subscriptionId: result.subscription.id,
      email: result.subscription.email || null,
      userId: result.subscription.user_id || null,
      anonymousId: result.subscription.anonymous_id || null,
    })
  );

  return result;
}

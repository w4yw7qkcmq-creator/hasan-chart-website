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

export async function subscribeToWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

  if (!publicKey) {
    throw new Error("MISSING_VAPID_PUBLIC_KEY");
  }

  const registration = await ensureServiceWorkerRegistration();
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

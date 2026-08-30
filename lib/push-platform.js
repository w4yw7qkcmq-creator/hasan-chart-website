/**
 * Client-side Web Push platform detection (SSR-safe — returns false when window is absent).
 * UA is used only for iOS; PWA/standalone uses display-mode / navigator.standalone.
 */

export function detectIsIOS(userAgent = "") {
  if (typeof navigator !== "undefined" && !userAgent) {
    userAgent = navigator.userAgent || "";
  }

  const ua = String(userAgent);

  if (/iPhone|iPad|iPod/i.test(ua)) {
    return true;
  }

  if (typeof navigator !== "undefined") {
    const platform = navigator.platform || "";
    const maxTouchPoints = navigator.maxTouchPoints || 0;

    if (platform === "MacIntel" && maxTouchPoints > 1) {
      return true;
    }
  }

  return false;
}

export function detectIsStandalone() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.matchMedia?.("(display-mode: standalone)").matches) {
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.standalone === true) {
    return true;
  }

  return false;
}

export function detectIsIOSBrowserTab(env = {}) {
  const isIOS = env.isIOS ?? detectIsIOS();
  const isStandalone = env.isStandalone ?? detectIsStandalone();

  return isIOS && !isStandalone;
}

export function detectWebPushCapabilities() {
  if (typeof window === "undefined") {
    return {
      serviceWorkerSupported: false,
      pushManagerSupported: false,
      notificationSupported: false,
      webPushSupported: false,
    };
  }

  const serviceWorkerSupported = "serviceWorker" in navigator;
  const pushManagerSupported = "PushManager" in window;
  const notificationSupported = "Notification" in window;
  const webPushSupported =
    serviceWorkerSupported && pushManagerSupported && notificationSupported;

  return {
    serviceWorkerSupported,
    pushManagerSupported,
    notificationSupported,
    webPushSupported,
  };
}

export function detectPushPlatformContext(env = {}) {
  const isIOS = env.isIOS ?? detectIsIOS();
  const isStandalone = env.isStandalone ?? detectIsStandalone();
  const isIOSBrowserTab = isIOS && !isStandalone;
  const capabilities = env.capabilities ?? detectWebPushCapabilities();

  return {
    isIOS,
    isStandalone,
    isIOSBrowserTab,
    ...capabilities,
  };
}

export const IOS_HOME_SCREEN_GUIDANCE_MESSAGE =
  "لتفعيل إشعارات HasaN CharT على iPhone، يجب أولاً إضافة الموقع إلى الشاشة الرئيسية.\n\n" +
  "1. اضغط زر المشاركة في Safari\n" +
  "2. اختر «إضافة إلى الشاشة الرئيسية»\n" +
  "3. اضغط «إضافة»\n" +
  "4. افتح HasaN CharT من أيقونة الشاشة الرئيسية\n" +
  "5. اضغط زر الجرس مرة أخرى واسمح بالإشعارات";

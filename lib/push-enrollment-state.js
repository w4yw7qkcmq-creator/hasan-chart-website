/**
 * Browser push enrollment — permission alone is not "enabled".
 * Enrolled = granted permission + live PushManager subscription.
 */

export const PUSH_ENROLLMENT = Object.freeze({
  UNSUPPORTED: "unsupported",
  DENIED: "denied",
  PROMPT: "prompt",
  NEEDS_REENABLE: "needs_reenable",
  ENROLLED: "enrolled",
});

export function resolvePushEnrollmentFromBrowserState({
  permission = "default",
  hasSubscription = false,
  serviceWorkerSupported = true,
  notificationSupported = true,
} = {}) {
  if (!serviceWorkerSupported || !notificationSupported) {
    return PUSH_ENROLLMENT.UNSUPPORTED;
  }

  if (permission === "denied") {
    return PUSH_ENROLLMENT.DENIED;
  }

  if (permission === "granted" && hasSubscription) {
    return PUSH_ENROLLMENT.ENROLLED;
  }

  if (permission === "granted" && !hasSubscription) {
    return PUSH_ENROLLMENT.NEEDS_REENABLE;
  }

  return PUSH_ENROLLMENT.PROMPT;
}

export function pushEnrollmentLabelsAr(enrollment) {
  switch (enrollment) {
    case PUSH_ENROLLMENT.ENROLLED:
      return {
        label: "🔔 إشعارات المتصفح مفعّلة ✅",
        ariaLabel: "إشعارات المتصفح مفعّلة",
        active: true,
        needsReenable: false,
      };
    case PUSH_ENROLLMENT.NEEDS_REENABLE:
      return {
        label: "🔔 إشعارات المتصفح تحتاج إعادة تفعيل",
        ariaLabel: "إعادة تفعيل إشعارات المتصفح",
        active: false,
        needsReenable: true,
      };
    case PUSH_ENROLLMENT.DENIED:
      return {
        label: "🔔 إشعارات المتصفح محظورة",
        ariaLabel: "إشعارات المتصفح محظورة في المتصفح",
        active: false,
        needsReenable: false,
      };
    case PUSH_ENROLLMENT.UNSUPPORTED:
      return {
        label: "🔔 إشعارات المتصفح غير مدعومة",
        ariaLabel: "إشعارات المتصفح غير مدعومة",
        active: false,
        needsReenable: false,
      };
    default:
      return {
        label: "🔔 تفعيل إشعارات المتصفح",
        ariaLabel: "تفعيل إشعارات المتصفح",
        active: false,
        needsReenable: false,
      };
  }
}

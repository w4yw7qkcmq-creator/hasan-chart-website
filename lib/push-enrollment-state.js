/**
 * Browser push enrollment — permission alone is not "enabled".
 * Enrolled = granted permission + live PushManager subscription.
 */

export const PUSH_ENROLLMENT = Object.freeze({
  UNSUPPORTED: "unsupported",
  NEEDS_HOME_SCREEN: "needs_home_screen",
  DENIED: "denied",
  PROMPT: "prompt",
  NEEDS_REENABLE: "needs_reenable",
  ENROLLED: "enrolled",
});

export function resolvePushEnrollmentFromBrowserState({
  permission = "default",
  hasSubscription = false,
  serviceWorkerSupported = true,
  pushManagerSupported = true,
  notificationSupported = true,
  needsHomeScreen = false,
} = {}) {
  if (needsHomeScreen) {
    return PUSH_ENROLLMENT.NEEDS_HOME_SCREEN;
  }

  if (!serviceWorkerSupported || !pushManagerSupported || !notificationSupported) {
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

export function pushEnrollmentCompactUi(enrollment, { checking = false } = {}) {
  if (checking) {
    return {
      variant: "checking",
      badge: "checking",
      badgeSymbol: "",
      ariaLabel: "جاري التحقق من إشعارات المتصفح",
      title: "جاري التحقق من إشعارات المتصفح",
      disabled: true,
      active: false,
    };
  }

  switch (enrollment) {
    case PUSH_ENROLLMENT.ENROLLED:
      return {
        variant: "enrolled",
        badge: "success",
        badgeSymbol: "✓",
        ariaLabel: "إشعارات المتصفح مفعّلة",
        title: "إشعارات المتصفح مفعّلة",
        disabled: false,
        active: true,
      };
    case PUSH_ENROLLMENT.NEEDS_REENABLE:
      return {
        variant: "warning",
        badge: "warning",
        badgeSymbol: "!",
        ariaLabel: "إعادة تفعيل إشعارات المتصفح",
        title: "تحتاج إعادة تفعيل إشعارات المتصفح",
        disabled: false,
        active: false,
        needsReenable: true,
      };
    case PUSH_ENROLLMENT.DENIED:
      return {
        variant: "denied",
        badge: "blocked",
        badgeSymbol: "×",
        ariaLabel: "إشعارات المتصفح محظورة",
        title: "إشعارات المتصفح محظورة من إعدادات المتصفح",
        disabled: false,
        active: false,
      };
    case PUSH_ENROLLMENT.NEEDS_HOME_SCREEN:
      return {
        variant: "needs_home_screen",
        badge: "info",
        badgeSymbol: "+",
        ariaLabel: "إضافة الموقع للشاشة الرئيسية لتفعيل إشعارات iPhone",
        title: "أضِف الموقع للشاشة الرئيسية لتفعيل إشعارات iPhone",
        disabled: false,
        active: false,
      };
    case PUSH_ENROLLMENT.UNSUPPORTED:
      return {
        variant: "unsupported",
        badge: null,
        badgeSymbol: "",
        ariaLabel: "إشعارات المتصفح غير مدعومة",
        title: "إشعارات المتصفح غير مدعومة",
        disabled: true,
        active: false,
      };
    default:
      return {
        variant: "prompt",
        badge: "blocked",
        badgeSymbol: "×",
        ariaLabel: "تفعيل إشعارات المتصفح",
        title: "تفعيل إشعارات المتصفح",
        disabled: false,
        active: false,
      };
  }
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
    case PUSH_ENROLLMENT.NEEDS_HOME_SCREEN:
      return {
        label: "🔔 إضافة للشاشة الرئيسية لتفعيل الإشعارات",
        ariaLabel: "إضافة الموقع للشاشة الرئيسية لتفعيل إشعارات iPhone",
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

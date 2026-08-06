/**
 * Server-side feature flag for VIP status notifications.
 * VIP_STATUS_NOTIFICATIONS_ENABLED=true required for POST mutations.
 * Never use NEXT_PUBLIC_* for this gate.
 */
export function isVipStatusNotificationsEnabled() {
  const raw = String(process.env.VIP_STATUS_NOTIFICATIONS_ENABLED || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function vipStatusFeatureDisabledResponse() {
  return {
    ok: false,
    status: 503,
    error: "ميزة تحديث حالة توصيات VIP معطّلة حاليًا",
    code: "feature_disabled",
  };
}

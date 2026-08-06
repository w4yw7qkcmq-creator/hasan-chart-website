/**
 * Worker-side gate for VIP status delivery processing.
 * VIP_STATUS_DELIVERY_WORKER_ENABLED — never use NEXT_PUBLIC_*.
 */

export function isVipStatusDeliveryWorkerEnabled() {
  const raw = String(process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

import { MAX_VIP_STATUS_DELIVERY_ATTEMPTS } from "./vip-status-delivery-keys.js";

export { MAX_VIP_STATUS_DELIVERY_ATTEMPTS };

export function getVipStatusDeliveryWorkerConfig(overrides = {}) {
  const batchSize = Number(process.env.VIP_STATUS_DELIVERY_BATCH_SIZE || 25);
  const pollIntervalMs = Number(process.env.VIP_STATUS_DELIVERY_POLL_INTERVAL_MS || 2000);
  const staleTimeoutMs = Number(process.env.VIP_STATUS_DELIVERY_STALE_TIMEOUT_MS || 900000);
  const maxAttempts = Number(
    process.env.VIP_STATUS_DELIVERY_MAX_ATTEMPTS || MAX_VIP_STATUS_DELIVERY_ATTEMPTS
  );

  return {
    batchSize:
      Number.isFinite(batchSize) && batchSize > 0
        ? Math.min(Math.floor(batchSize), 100)
        : 25,
    pollIntervalMs:
      Number.isFinite(pollIntervalMs) && pollIntervalMs >= 1000
        ? Math.floor(pollIntervalMs)
        : 2000,
    staleTimeoutMinutes:
      Number.isFinite(staleTimeoutMs) && staleTimeoutMs > 0
        ? Math.max(Math.floor(staleTimeoutMs / 60000), 1)
        : 15,
    maxAttempts:
      Number.isFinite(maxAttempts) && maxAttempts > 0
        ? Math.min(Math.floor(maxAttempts), 10)
        : MAX_VIP_STATUS_DELIVERY_ATTEMPTS,
    ...overrides,
  };
}

/** Backoff: 1m → 5m → 15m (matches project email queue pattern). */
export function calculateVipStatusRetryDelay(attemptCount) {
  const attempt = Math.max(1, Number(attemptCount) || 1);
  if (attempt <= 1) return 60 * 1000;
  if (attempt === 2) return 5 * 60 * 1000;
  return 15 * 60 * 1000;
}

export function buildVipStatusWorkerId() {
  const host = String(process.env.HOSTNAME || process.env.RAILWAY_REPLICA_ID || "local").slice(
    0,
    32
  );
  return `vip-status-${host}-${process.pid}`;
}

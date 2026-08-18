import { createHmac, timingSafeEqual } from "node:crypto";

/** Retention policy (documented): network 90d, device 180d, velocity 7d default. */
export const SIGNAL_RETENTION_DAYS = Object.freeze({
  ip: 90,
  network: 90,
  device: 180,
  visitor: 180,
  email: 90,
  cluster: 90,
  velocity: 7,
});

const NAMESPACES = Object.freeze({
  IP: "ip",
  NETWORK: "network",
  DEVICE: "device",
  VISITOR: "visitor",
  EMAIL: "email",
  CLUSTER: "cluster",
});

function getHmacSecret() {
  return (
    process.env.SECURITY_SIGNAL_HMAC_SECRET?.trim() ||
    process.env.AUTH_RATE_LIMIT_PEPPER?.trim() ||
    ""
  );
}

export function isSecuritySignalHmacConfigured() {
  return Boolean(getHmacSecret());
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function hashSecuritySignal(namespace, value) {
  const secret = getHmacSecret();
  if (!secret) {
    throw new Error("SECURITY_SIGNAL_HMAC_SECRET_NOT_CONFIGURED");
  }
  const normalized = normalizeValue(value);
  if (!normalized || normalized === "unknown") {
    return null;
  }
  return createHmac("sha256", secret)
    .update(`${namespace}:${normalized}`)
    .digest("hex");
}

export function hashIpSignal(clientIp) {
  return hashSecuritySignal(NAMESPACES.IP, clientIp);
}

export function hashNetworkSignal(clientIp) {
  return hashSecuritySignal(NAMESPACES.NETWORK, clientIp);
}

export function hashDeviceSignal(deviceToken) {
  return hashSecuritySignal(NAMESPACES.DEVICE, deviceToken);
}

export function hashVisitorSignal(visitorKey) {
  return hashSecuritySignal(NAMESPACES.VISITOR, visitorKey);
}

export function hashEmailSignal(email) {
  return hashSecuritySignal(NAMESPACES.EMAIL, email);
}

export function hashClusterSignal(parts = []) {
  const joined = parts.map(normalizeValue).filter(Boolean).join("|");
  if (!joined) return null;
  return hashSecuritySignal(NAMESPACES.CLUSTER, joined);
}

export function maskSignalHash(hash, visible = 8) {
  const value = String(hash || "");
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

export function safeCompareHash(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function expiresAtForSignalType(signalType) {
  const days =
    SIGNAL_RETENTION_DAYS[String(signalType || "").split("_")[0]?.toLowerCase()] ||
    SIGNAL_RETENTION_DAYS.network;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** @deprecated Prefer hashNetworkSignal (HMAC). Kept for transitional rate-limit keys. */
export function legacyHashNetworkKey(clientIp) {
  return hashNetworkSignal(clientIp)?.slice(0, 16) || "unknown";
}

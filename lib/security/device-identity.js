import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashDeviceSignal } from "./security-signal-hash.js";

export const DEVICE_COOKIE_NAME = "hc_device";
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function getDeviceSecret() {
  return (
    process.env.SECURITY_SIGNAL_HMAC_SECRET?.trim() ||
    process.env.AUTH_RATE_LIMIT_PEPPER?.trim() ||
    "hasan-chart-device-v1"
  );
}

export function generateDeviceToken() {
  return randomBytes(32).toString("hex");
}

export function signDeviceToken(token) {
  return createHmac("sha256", getDeviceSecret())
    .update(`device:${token}`)
    .digest("hex")
    .slice(0, 32);
}

export function buildSignedDeviceCookieValue(token) {
  const clean = String(token || "").trim();
  const signature = signDeviceToken(clean);
  return `${clean}.${signature}`;
}

export function parseSignedDeviceCookieValue(raw) {
  const value = String(raw || "").trim();
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { valid: false, token: null, tampered: true };
  const token = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = signDeviceToken(token);
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { valid: false, token: null, tampered: true };
  }
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return { valid: false, token: null, tampered: true };
  }
  return { valid: true, token, tampered: false };
}

export function readDeviceTokenFromRequest(request) {
  const raw = request.cookies?.get?.(DEVICE_COOKIE_NAME)?.value;
  if (!raw) {
    const fresh = generateDeviceToken();
    return {
      token: fresh,
      tampered: false,
      issued: true,
      hash: hashDeviceSignal(fresh),
    };
  }
  const parsed = parseSignedDeviceCookieValue(raw);
  if (parsed.valid) {
    return { token: parsed.token, tampered: false, issued: false, hash: hashDeviceSignal(parsed.token) };
  }
  const fresh = generateDeviceToken();
  return {
    token: fresh,
    tampered: true,
    issued: true,
    hash: hashDeviceSignal(fresh),
  };
}

export function attachDeviceCookie(response, token) {
  response.cookies.set(DEVICE_COOKIE_NAME, buildSignedDeviceCookieValue(token), {
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
  return response;
}

export function ensureDeviceIdentity(request, response) {
  const state = readDeviceTokenFromRequest(request);
  if (state.issued && state.token && response) {
    attachDeviceCookie(response, state.token);
  }
  return state;
}

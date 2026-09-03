const ALLOWED_HOSTNAMES = new Set([
  "hasanchartworld.com",
  "www.hasanchartworld.com",
  "localhost",
  "127.0.0.1",
]);

export const TURNSTILE_REGISTRATION_ERROR_AR =
  "تعذر التحقق من أنك مستخدم حقيقي. حاول مرة أخرى.";

export const TURNSTILE_LOGIN_ERROR_AR =
  "فشل التحقق الأمني. حاول مرة أخرى.";

const usedTokens = globalThis.__turnstileUsedTokens || new Map();
globalThis.__turnstileUsedTokens = usedTokens;

function pruneUsedTokens() {
  const now = Date.now();
  for (const [token, expiresAt] of usedTokens.entries()) {
    if (expiresAt <= now) usedTokens.delete(token);
  }
}

function getUsedTokenKey(token, scope = "") {
  return scope ? `${scope}:${token}` : token;
}

function isTokenUsed(token, scope = "") {
  pruneUsedTokens();
  return usedTokens.has(getUsedTokenKey(token, scope));
}

function markTokenUsed(token, scope = "") {
  pruneUsedTokens();
  usedTokens.set(getUsedTokenKey(token, scope), Date.now() + 5 * 60 * 1000);
}

export function isTurnstileConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

function isTestTurnstileSecret(secret = "") {
  const value = String(secret || "").trim();
  return value.startsWith("1x") || value.startsWith("2x") || value.startsWith("3x");
}

const TEST_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export async function verifyTurnstileTokenServer({
  token,
  remoteIp,
  expectedAction = null,
  allowSkipWhenUnconfigured = false,
} = {}) {
  const siteKeyConfigured = isTurnstileConfigured();
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!siteKeyConfigured) {
    return allowSkipWhenUnconfigured
      ? { ok: true, skipped: true }
      : { ok: false, error: TURNSTILE_REGISTRATION_ERROR_AR, status: 503 };
  }

  if (!secret) {
    return { ok: false, error: "خطأ في إعدادات الحماية الأمنية.", status: 500 };
  }

  if (!token || typeof token !== "string") {
    return { ok: false, error: TURNSTILE_REGISTRATION_ERROR_AR, status: 400 };
  }

  const replayScope = `${expectedAction || "any"}:${remoteIp || "unknown"}`;
  if (isTokenUsed(token, replayScope)) {
    return { ok: false, error: TURNSTILE_REGISTRATION_ERROR_AR, status: 403, replay: true };
  }

  if (isTestTurnstileSecret(secret)) {
    if (token !== TEST_DUMMY_TOKEN) {
      return {
        ok: false,
        error: TURNSTILE_REGISTRATION_ERROR_AR,
        status: 403,
        codes: ["invalid-input-response"],
      };
    }
    markTokenUsed(token, replayScope);
    return {
      ok: true,
      hostname: "localhost",
      action: expectedAction || null,
      testMode: true,
    };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) {
    formData.append("remoteip", remoteIp);
  }

  let verifyResponse;
  try {
    verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );
  } catch {
    return {
      ok: false,
      error: TURNSTILE_REGISTRATION_ERROR_AR,
      status: 504,
      timeout: true,
      reason: "network_error",
    };
  }

  if (!verifyResponse.ok) {
    return {
      ok: false,
      error: TURNSTILE_REGISTRATION_ERROR_AR,
      status: 502,
      reason: "cloudflare_http_error",
    };
  }

  const result = await verifyResponse.json();
  if (!result?.success) {
    return {
      ok: false,
      error: TURNSTILE_REGISTRATION_ERROR_AR,
      status: 403,
      codes: result?.["error-codes"] || [],
      reason: "cloudflare_rejected",
    };
  }

  const hostname = String(result?.hostname || "").toLowerCase();
  const hostnameAllowed =
    ALLOWED_HOSTNAMES.has(hostname) ||
    (isTestTurnstileSecret(secret) && (hostname === "example.com" || hostname === "localhost"));
  if (!hostnameAllowed) {
    return {
      ok: false,
      error: TURNSTILE_REGISTRATION_ERROR_AR,
      status: 403,
      reason: "hostname_mismatch",
      hostname,
    };
  }

  if (expectedAction && result?.action && result.action !== expectedAction) {
    return {
      ok: false,
      error: TURNSTILE_REGISTRATION_ERROR_AR,
      status: 403,
      reason: "action_mismatch",
      action: result.action,
      expectedAction,
    };
  }

  markTokenUsed(token, replayScope);

  return {
    ok: true,
    hostname: result.hostname || null,
    action: result.action || null,
    challengeTs: result.challenge_ts || null,
  };
}

export const PASSWORD_RECOVERY_PATH = "/reset-password";
export const MIN_RECOVERY_PASSWORD_LENGTH = 6;
export const CANONICAL_SITE_ORIGIN = "https://www.hasanchartworld.com";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function parseOriginCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? new URL(raw) : new URL(`https://${raw}`);
    if (url.username || url.password) return null;
    if (url.pathname && url.pathname !== "/") return null;
    if (url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname) {
  return LOCAL_HOSTS.has(String(hostname || "").toLowerCase());
}

export function resolvePasswordRecoveryRedirectUrl({
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  const configured = parseOriginCandidate(siteUrl);
  const isProd = nodeEnv === "production";

  if (configured) {
    const local = isLocalHostname(configured.hostname);

    if (local && isProd) {
      return `${CANONICAL_SITE_ORIGIN}${PASSWORD_RECOVERY_PATH}`;
    }

    if (local && (configured.protocol === "http:" || configured.protocol === "https:")) {
      return `${configured.origin}${PASSWORD_RECOVERY_PATH}`;
    }

    if (configured.protocol === "https:") {
      return `${configured.origin}${PASSWORD_RECOVERY_PATH}`;
    }
  }

  return `${CANONICAL_SITE_ORIGIN}${PASSWORD_RECOVERY_PATH}`;
}

export function validateRecoveryPassword(password, confirmPassword) {
  const nextPassword = String(password || "");
  const confirmation = String(confirmPassword || "");

  if (!nextPassword || !confirmation) {
    return { ok: false, error: "اكتب كلمة المرور الجديدة وتأكيدها" };
  }

  if (nextPassword.length < MIN_RECOVERY_PASSWORD_LENGTH) {
    return { ok: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
  }

  if (nextPassword !== confirmation) {
    return { ok: false, error: "كلمة المرور وتأكيدها غير متطابقين" };
  }

  return { ok: true, error: null };
}

export function assertRecoveryIdentityIsolated({ recoveryUserId, cookieUserId } = {}) {
  const recoveryId = String(recoveryUserId || "").trim();
  const cookieId = String(cookieUserId || "").trim();

  if (!recoveryId) {
    return { ok: false, reason: "missing_recovery_user" };
  }

  if (cookieId && cookieId !== recoveryId) {
    return { ok: false, reason: "session_mismatch" };
  }

  return { ok: true, reason: null };
}

function readParams(value, leadingChar) {
  const raw = String(value || "");
  const trimmed = raw.startsWith(leadingChar) ? raw.slice(1) : raw;
  return new URLSearchParams(trimmed);
}

function hasExpiredSignal(params) {
  const code = String(params.get("error_code") || "");
  const description = String(params.get("error_description") || params.get("error") || "");
  return /expired|otp_expired|token_expired/i.test(`${code} ${description}`);
}

export function parseRecoveryUrlParts({ search = "", hash = "" } = {}) {
  const query = readParams(search, "?");
  const hashParams = readParams(hash, "#");

  if (query.get("error") || query.get("error_code") || hashParams.get("error") || hashParams.get("error_code")) {
    return {
      kind: hasExpiredSignal(query) || hasExpiredSignal(hashParams) ? "expired" : "invalid",
    };
  }

  const type = String(hashParams.get("type") || query.get("type") || "")
    .trim()
    .toLowerCase();
  const tokenHash = String(query.get("token_hash") || "").trim();
  const code = String(query.get("code") || "").trim();
  const accessToken = String(hashParams.get("access_token") || "").trim();
  const refreshToken = String(hashParams.get("refresh_token") || "").trim();

  if (type && type !== "recovery") {
    return { kind: "unsupported" };
  }

  if (tokenHash) {
    if (type !== "recovery") {
      return { kind: "missing" };
    }

    return {
      kind: "token_hash",
      type: "recovery",
      tokenHash,
    };
  }

  if (accessToken && refreshToken && type === "recovery") {
    return {
      kind: "session_tokens",
      type: "recovery",
      accessToken,
      refreshToken,
    };
  }

  if (code) {
    return {
      kind: "pkce_code",
      type: type || "recovery",
      code,
    };
  }

  return { kind: "missing" };
}

export function classifyRecoveryAuthError(error) {
  const message = String(error?.message || error?.code || "");
  if (/expired|otp_expired|token_expired/i.test(message)) {
    return "expired";
  }
  return "invalid";
}

function recoveryUserFrom(data) {
  const user = data?.user || data?.session?.user || null;
  const accessToken = data?.session?.access_token || null;

  if (!user?.id || !accessToken) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email || "" },
    accessToken,
  };
}

export async function establishRecoverySession(client, parsed) {
  if (!client || !parsed?.kind) {
    return { ok: false, reason: "invalid" };
  }

  if (parsed.kind === "expired") {
    return { ok: false, reason: "expired" };
  }

  if (parsed.kind === "invalid" || parsed.kind === "missing" || parsed.kind === "unsupported") {
    return { ok: false, reason: "invalid" };
  }

  try {
    if (parsed.kind === "token_hash") {
      const { data, error } = await client.auth.verifyOtp({
        token_hash: parsed.tokenHash,
        type: "recovery",
      });
      if (error) {
        return { ok: false, reason: classifyRecoveryAuthError(error) };
      }
      return recoveryUserFrom(data);
    }

    if (parsed.kind === "pkce_code") {
      const { data, error } = await client.auth.exchangeCodeForSession(parsed.code);
      if (error) {
        return { ok: false, reason: classifyRecoveryAuthError(error) };
      }
      return recoveryUserFrom(data);
    }

    if (parsed.kind === "session_tokens") {
      const { data, error } = await client.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (error) {
        return { ok: false, reason: classifyRecoveryAuthError(error) };
      }
      return recoveryUserFrom(data);
    }
  } catch (error) {
    return { ok: false, reason: classifyRecoveryAuthError(error) };
  }

  return { ok: false, reason: "invalid" };
}

let pendingRecoveryParts = null;

export function clearRecoveryParamsFromUrl(locationWindow = globalThis.window) {
  if (!locationWindow?.location || !locationWindow?.history?.replaceState) return;

  const url = new URL(locationWindow.location.href);
  if (!url.search && !url.hash) return;

  url.search = "";
  url.hash = "";
  locationWindow.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

export function takeRecoveryUrlParts(locationWindow = globalThis.window) {
  if (!locationWindow?.location) {
    return { kind: "missing" };
  }

  const current = parseRecoveryUrlParts({
    search: locationWindow.location.search,
    hash: locationWindow.location.hash,
  });

  if (current.kind !== "missing") {
    pendingRecoveryParts = current;
    clearRecoveryParamsFromUrl(locationWindow);
    return current;
  }

  return pendingRecoveryParts || current;
}

export function clearPendingRecoveryParts() {
  pendingRecoveryParts = null;
}

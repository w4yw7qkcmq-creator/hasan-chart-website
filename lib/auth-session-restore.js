export function classifySessionRestoreResponse(response, payload) {
  if (!response) {
    return { outcome: "transient_error", reason: "network_timeout" };
  }

  if (response.status >= 500) {
    return { outcome: "transient_error", reason: "server_error" };
  }

  if (!response.ok) {
    return { outcome: "unauthenticated", reason: "not_ok" };
  }

  if (
    payload?.authenticated &&
    payload?.user?.email &&
    payload?.session?.access_token &&
    payload?.session?.refresh_token
  ) {
    return { outcome: "authenticated", reason: "server_session" };
  }

  return { outcome: "unauthenticated", reason: "missing_session" };
}

export function shouldRetrySessionRestore(outcome, attempt, maxAttempts = 3) {
  return outcome === "transient_error" && attempt < maxAttempts;
}

export function buildAuthenticatedRestoreResult(payload, { clientRestored = false } = {}) {
  return {
    outcome: "authenticated",
    restored: clientRestored,
    sessionUser: payload.user,
    isAdmin: Boolean(payload.isAdmin),
    session: payload.session,
  };
}

export function buildUnauthenticatedRestoreResult() {
  return {
    outcome: "unauthenticated",
    restored: false,
    sessionUser: null,
    isAdmin: false,
    session: null,
  };
}

export function buildTransientRestoreResult(reason = "network_error") {
  return {
    outcome: "transient_error",
    restored: false,
    sessionUser: null,
    isAdmin: false,
    session: null,
    reason,
  };
}

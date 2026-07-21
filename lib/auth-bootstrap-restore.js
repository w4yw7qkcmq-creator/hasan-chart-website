export const AUTH_BOOTSTRAP_MAX_ATTEMPTS = 3;
export const AUTH_BOOTSTRAP_RETRY_DELAYS_MS = [250, 600];

export function getBootstrapRetryDelayMs(failedAttempt) {
  const index = Math.max(0, Number(failedAttempt) - 1);
  return AUTH_BOOTSTRAP_RETRY_DELAYS_MS[index] ?? AUTH_BOOTSTRAP_RETRY_DELAYS_MS.at(-1);
}

export function shouldRunBootstrapRetry({ outcome, attempt, maxAttempts = AUTH_BOOTSTRAP_MAX_ATTEMPTS }) {
  if (outcome === "authenticated" || outcome === "unauthenticated") {
    return false;
  }

  return outcome === "transient_error" && attempt < maxAttempts;
}

export function isBootstrapRequestCurrent(currentRequestId, requestId) {
  return currentRequestId === requestId;
}

export function canApplyBootstrapResult({
  currentRequestId,
  requestId,
  mounted = true,
}) {
  return mounted && isBootstrapRequestCurrent(currentRequestId, requestId);
}

export function shouldMarkBootstrapError({
  currentRequestId,
  requestId,
  mounted = true,
  authenticated = false,
}) {
  return mounted && isBootstrapRequestCurrent(currentRequestId, requestId) && !authenticated;
}

export function resolveBootstrapAttemptOutcome({
  restoreOutcome,
  hasServerSessionUser = false,
  hasSupabaseUser = false,
}) {
  if (restoreOutcome === "authenticated" && hasServerSessionUser) {
    return "authenticated";
  }

  if (restoreOutcome === "unauthenticated") {
    return hasSupabaseUser ? "authenticated" : "unauthenticated";
  }

  if (restoreOutcome === "transient_error") {
    return hasSupabaseUser ? "authenticated" : "transient_error";
  }

  return hasSupabaseUser ? "authenticated" : "unauthenticated";
}

export function simulateBootstrapPhases(restoreOutcomes, { maxAttempts = AUTH_BOOTSTRAP_MAX_ATTEMPTS } = {}) {
  const phases = ["loading"];

  for (let attempt = 1; attempt <= restoreOutcomes.length; attempt += 1) {
    const restoreOutcome = restoreOutcomes[attempt - 1];
    const attemptOutcome = resolveBootstrapAttemptOutcome({
      restoreOutcome,
      hasServerSessionUser: restoreOutcome === "authenticated",
      hasSupabaseUser: false,
    });

    if (attemptOutcome === "authenticated") {
      phases.push("authenticated");
      return phases;
    }

    if (attemptOutcome === "unauthenticated") {
      phases.push("unauthenticated");
      return phases;
    }

    if (shouldRunBootstrapRetry({ outcome: attemptOutcome, attempt, maxAttempts })) {
      phases.push("loading");
      continue;
    }

    phases.push("error");
    return phases;
  }

  phases.push("error");
  return phases;
}

export function waitWithAbort(ms, signal) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }

  if (signal?.aborted) {
    return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
  }

  return new Promise((resolve, reject) => {
    const timerId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timerId);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

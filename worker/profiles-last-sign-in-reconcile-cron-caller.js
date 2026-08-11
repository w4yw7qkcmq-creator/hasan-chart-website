#!/usr/bin/env node
/**
 * Railway Cron caller — GET /api/admin/reconcile-profiles-last-sign-in with machine identity.
 * One-shot daily reconciliation. Logs counts only (no PII/secrets).
 */
function envValue(key) {
  return String(process.env[key] ?? "").trim();
}

function log(event, extra = {}) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...extra }));
}

function getApiBase() {
  return envValue("PRODUCTION_URL") || envValue("WEB_APP_URL");
}

function getTimeoutMs() {
  const raw = envValue("PROFILES_LAST_SIGN_IN_RECONCILE_TIMEOUT_MS");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

function validateEnvironment() {
  const apiBase = getApiBase();
  if (!apiBase) {
    return { ok: false, reason: "missing_url" };
  }

  const accountId = envValue("IAM_CRON_SERVICE_ACCOUNT_ID");
  if (!accountId) {
    return { ok: false, reason: "missing_service_account_id" };
  }

  const secret = envValue("IAM_CRON_SERVICE_SECRET") || envValue("CRON_SECRET");
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  return { ok: true, apiBase, accountId, secret };
}

function buildSummary(res, body, durationMs) {
  return {
    status: res.status,
    ok: res.ok,
    success: body?.success ?? null,
    eligible: body?.eligibleAuthPopulated ?? null,
    updated: body?.updatedCount ?? null,
    remainingMismatch: body?.remainingMismatch ?? null,
    error: body?.error ? String(body.error).slice(0, 120) : null,
    durationMs,
  };
}

function isSuccessResponse(res, body) {
  if (!res.ok || body?.success !== true) {
    return false;
  }
  if (body?.remainingMismatch == null || Number(body.remainingMismatch) !== 0) {
    return false;
  }
  return true;
}

async function main() {
  const validation = validateEnvironment();
  if (!validation.ok) {
    log("PROFILES_LAST_SIGN_IN_RECONCILE_FAILED", {
      reason: validation.reason,
      durationMs: 0,
    });
    process.exitCode = 1;
    return;
  }

  const { apiBase, accountId, secret } = validation;
  const target = `${apiBase.replace(/\/+$/, "")}/api/admin/reconcile-profiles-last-sign-in`;
  const startedAt = Date.now();
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  log("PROFILES_LAST_SIGN_IN_RECONCILE_START", {
    targetHost: new URL(target).host,
    timeoutMs,
  });

  try {
    const res = await fetch(target, {
      method: "GET",
      headers: {
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
      },
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    const durationMs = Date.now() - startedAt;
    const summary = buildSummary(res, body, durationMs);

    if (body == null) {
      log("PROFILES_LAST_SIGN_IN_RECONCILE_FAILED", {
        ...summary,
        reason: "invalid_json",
      });
      process.exitCode = 1;
      return;
    }

    if (!isSuccessResponse(res, body)) {
      log("PROFILES_LAST_SIGN_IN_RECONCILE_FAILED", summary);
      process.exitCode = 1;
      return;
    }

    log("PROFILES_LAST_SIGN_IN_RECONCILE_SUCCESS", summary);
    process.exitCode = 0;
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    log("PROFILES_LAST_SIGN_IN_RECONCILE_FAILED", {
      reason: timedOut ? "timeout" : "network_error",
      error: timedOut ? "request_timeout" : String(error?.message || error).slice(0, 120),
      durationMs: Date.now() - startedAt,
    });
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

main();

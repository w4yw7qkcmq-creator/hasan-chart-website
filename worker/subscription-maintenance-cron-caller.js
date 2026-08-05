#!/usr/bin/env node
/**
 * Railway Cron Job caller — POST /run on Subscription Maintenance API with machine identity.
 * One-shot process (exit after single request). Never logs secrets or headers.
 */
const {
  assertCronCallerEnvironmentOrThrow,
  validateCronCallerEnvironment,
  getCronApiUrl,
  getMaintenanceAccountId,
  isDryRunEnabled,
  getCallerTimeoutMs,
  envValue,
} = require("./lib/subscription-maintenance-env");
const { recordCallerResult } = require("./lib/subscription-maintenance-metrics");

function log(event, extra = {}) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...extra }));
}

function rejectLegacyEnv() {
  const hasLegacy = Object.keys(process.env).some(
    (key) =>
      /^(CRON_SECRET|ADMIN_CRON_SECRET|WORKER_API_SECRET)$/i.test(key) &&
      envValue(key)
  );
  if (hasLegacy) {
    log("legacy_env_present_ignored", { note: "caller ignores legacy secret env vars" });
  }
}

async function callMaintenanceApi() {
  const startedAt = Date.now();
  let validation = null;

  try {
    validation = assertCronCallerEnvironmentOrThrow();
    log("subscription_maintenance_cron_env_validated", {
      checks: Object.keys(validation.validated || {}),
      dryRun: isDryRunEnabled(),
      timeoutMs: getCallerTimeoutMs(),
    });
  } catch (error) {
    log("subscription_maintenance_cron_env_invalid", {
      error: error?.message || String(error),
    });
    process.exitCode = 1;
    return;
  }

  const apiUrl = getCronApiUrl();
  const accountId = getMaintenanceAccountId();
  const secret = envValue("IAM_SUBSCRIPTION_MAINTENANCE_SECRET");
  const dryRun = isDryRunEnabled();
  const timeoutMs = getCallerTimeoutMs();

  rejectLegacyEnv();

  const target = `${apiUrl}/run${dryRun ? "?dryRun=true" : ""}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  log("subscription_maintenance_cron_call_start", {
    targetHost: new URL(apiUrl).host,
    dryRun,
    accountId,
    timeoutMs,
  });

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({ dryRun }),
      signal: controller.signal,
    });

    const requestId =
      res.headers.get("x-railway-request-id") ||
      res.headers.get("x-request-id") ||
      res.headers.get("cf-ray") ||
      null;

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    const durationMs = Date.now() - startedAt;
    const summary = {
      status: res.status,
      ok: res.ok,
      success: body?.success ?? null,
      skipped: body?.skipped ?? null,
      error: body?.error ? String(body.error).slice(0, 120) : null,
      requestId,
      dryRun,
      durationMs,
    };

    if (res.status === 409) {
      log("subscription_maintenance_cron_call_duplicate", summary);
      recordCallerResult({ status: 409, durationMs, success: true });
      process.exitCode = 0;
      return;
    }

    if (res.status === 401 || res.status === 403) {
      log("subscription_maintenance_cron_call_auth_failed", summary);
      recordCallerResult({ status: res.status, durationMs, success: false });
      process.exitCode = 1;
      return;
    }

    if (!res.ok || body?.success === false) {
      log("subscription_maintenance_cron_call_failed", summary);
      recordCallerResult({ status: res.status, durationMs, success: false });
      process.exitCode = 1;
      return;
    }

    if (durationMs > 120_000) {
      log("subscription_maintenance_cron_call_slow_warning", { durationMs, thresholdMs: 120_000 });
    }

    log("subscription_maintenance_cron_call_success", summary);
    recordCallerResult({ status: res.status, durationMs, success: true });
    process.exitCode = 0;
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    const durationMs = Date.now() - startedAt;
    log("subscription_maintenance_cron_call_error", {
      timedOut,
      durationMs,
      error: timedOut ? "request_timeout" : String(error?.message || error).slice(0, 120),
    });
    recordCallerResult({ status: timedOut ? 408 : 0, durationMs, success: false });
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

callMaintenanceApi();

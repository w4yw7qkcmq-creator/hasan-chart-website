#!/usr/bin/env node
/**
 * Railway Cron Job caller — POST /run on Subscription Maintenance API with machine identity.
 * One-shot process (exit after single request). Never logs secrets or headers.
 */
const DEFAULT_TIMEOUT_MS = 90_000;

function log(event, extra = {}) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...extra }));
}

function resolveApiUrl() {
  return String(process.env.SUBSCRIPTION_MAINTENANCE_API_URL || "").trim().replace(/\/+$/, "");
}

function resolveAccountId() {
  return String(
    process.env.IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID || "subscription-maintenance-worker"
  ).trim();
}

function resolveSecret() {
  return String(process.env.IAM_SUBSCRIPTION_MAINTENANCE_SECRET || "").trim();
}

function isDryRun() {
  const raw = String(process.env.SUBSCRIPTION_MAINTENANCE_DRY_RUN || "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function rejectLegacyEnv() {
  const hasLegacy = Object.keys(process.env).some(
    (key) =>
      /^(CRON_SECRET|ADMIN_CRON_SECRET|WORKER_API_SECRET)$/i.test(key) &&
      String(process.env[key] || "").trim()
  );
  if (hasLegacy) {
    log("legacy_env_present_ignored", { note: "caller ignores legacy secret env vars" });
  }
}

async function callMaintenanceApi() {
  const apiUrl = resolveApiUrl();
  const accountId = resolveAccountId();
  const secret = resolveSecret();
  const dryRun = isDryRun();
  const timeoutMs = Number(process.env.SUBSCRIPTION_MAINTENANCE_CALL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  if (!apiUrl) throw new Error("SUBSCRIPTION_MAINTENANCE_API_URL is required.");
  if (!accountId) throw new Error("IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID is required.");
  if (!secret || secret.length < 32) throw new Error("IAM_SUBSCRIPTION_MAINTENANCE_SECRET is required.");

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

    const summary = {
      status: res.status,
      ok: res.ok,
      success: body?.success ?? null,
      skipped: body?.skipped ?? null,
      error: body?.error ? String(body.error).slice(0, 120) : null,
      requestId,
      dryRun,
    };

    if (!res.ok || body?.success === false) {
      log("subscription_maintenance_cron_call_failed", summary);
      process.exitCode = 1;
      return;
    }

    log("subscription_maintenance_cron_call_success", summary);
    process.exitCode = 0;
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    log("subscription_maintenance_cron_call_error", {
      timedOut,
      error: timedOut ? "request_timeout" : String(error?.message || error).slice(0, 120),
    });
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

callMaintenanceApi();

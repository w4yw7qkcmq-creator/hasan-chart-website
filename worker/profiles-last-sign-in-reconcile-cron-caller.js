#!/usr/bin/env node
/**
 * Railway Cron caller — GET /api/admin/reconcile-profiles-last-sign-in with machine identity.
 * One-shot daily reconciliation. Logs counts only (no PII).
 */
function envValue(key) {
  return String(process.env[key] ?? "").trim();
}

function log(event, extra = {}) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...extra }));
}

async function main() {
  const apiBase = envValue("PRODUCTION_URL") || envValue("WEB_APP_URL") || "https://www.hasanchartworld.com";
  const accountId = envValue("IAM_CRON_SERVICE_ACCOUNT_ID") || "cron";
  const secret = envValue("IAM_CRON_SERVICE_SECRET") || envValue("CRON_SECRET");

  if (!secret) {
    log("profiles_last_sign_in_reconcile_env_invalid", { error: "missing_cron_secret" });
    process.exitCode = 1;
    return;
  }

  const target = `${apiBase.replace(/\/+$/, "")}/api/admin/reconcile-profiles-last-sign-in`;
  const startedAt = Date.now();

  log("profiles_last_sign_in_reconcile_call_start", {
    targetHost: new URL(target).host,
    accountId,
  });

  try {
    const res = await fetch(target, {
      method: "GET",
      headers: {
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
      },
    });

    const body = await res.json().catch(() => null);
    const durationMs = Date.now() - startedAt;
    const summary = {
      status: res.status,
      ok: res.ok,
      success: body?.success ?? null,
      updatedCount: body?.updatedCount ?? null,
      remainingMismatch: body?.remainingMismatch ?? null,
      error: body?.error ? String(body.error).slice(0, 120) : null,
      durationMs,
    };

    if (!res.ok || body?.success === false) {
      log("profiles_last_sign_in_reconcile_call_failed", summary);
      process.exitCode = 1;
      return;
    }

    log("profiles_last_sign_in_reconcile_call_success", summary);
    process.exitCode = 0;
  } catch (error) {
    log("profiles_last_sign_in_reconcile_call_error", {
      error: String(error?.message || error).slice(0, 120),
      durationMs: Date.now() - startedAt,
    });
    process.exitCode = 1;
  }
}

main();

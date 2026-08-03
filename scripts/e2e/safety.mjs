import { SAFETY_BLOCKED_ACTIONS } from "./constants.mjs";

/**
 * Safety gate — blocks side-effectful operations during smoke runs.
 * Returns { allowed: false, mode: "VERIFY_ONLY" } for blocked actions.
 */
export function assertSafeAction(action, context = "") {
  if (SAFETY_BLOCKED_ACTIONS.includes(action)) {
    return {
      allowed: false,
      mode: "VERIFY_ONLY",
      reason: `Blocked by safety mode: ${action}${context ? ` (${context})` : ""}`,
    };
  }
  return { allowed: true, mode: "execute" };
}

/** Guard wrapper for dangerous HTTP calls — never invoke blocked endpoints. */
export function blockIfUnsafe(action, fn) {
  const gate = assertSafeAction(action);
  if (!gate.allowed) {
    return { executed: false, mode: "VERIFY_ONLY", reason: gate.reason };
  }
  return { executed: true, mode: "execute", result: fn() };
}

export function isE2eMarkedRow(row = {}) {
  const haystack = [
    row.plan_name,
    row.username,
    row.user_email,
    row.notes,
    row.telegram_username,
    row.payment_proof_path,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return haystack.includes("SMOKE") || haystack.includes("E2E") || haystack.includes("TEST ONLY");
}

/** Only touch subscription rows created by this smoke run. */
export function assertSmokeSubscriptionRow(row) {
  if (!row) return { ok: false, reason: "row missing" };
  if (!isE2eMarkedRow(row)) {
    return { ok: false, reason: "not an E2E-marked row — verify only" };
  }
  return { ok: true };
}

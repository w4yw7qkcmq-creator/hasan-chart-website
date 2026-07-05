/**
 * Email hooks for partner automation events.
 * No actual email delivery in Phase 9 — wire providers here later.
 */

const EMAIL_HOOK_EVENTS = new Set([
  "tier_upgraded",
  "commission_released",
  "withdraw_paid",
  "bonus_received",
  "achievement_unlocked",
  "leaderboard_changed",
  "withdrawal_created",
  "withdrawal_approved",
  "withdrawal_rejected",
]);

export async function sendPartnerEmailHook({
  event,
  partnerId,
  userId,
  email,
  subject,
  body,
  payload = {},
} = {}) {
  const normalizedEvent = String(event || "").trim();

  if (!EMAIL_HOOK_EVENTS.has(normalizedEvent)) {
    return { hookReady: true, skipped: true, reason: "unknown_event" };
  }

  const message = {
    event: normalizedEvent,
    partnerId: String(partnerId || ""),
    userId: String(userId || ""),
    email: email || null,
    subject: subject || null,
    body: body || null,
    payload,
    createdAt: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== "production") {
    console.info("[PARTNER_EMAIL_HOOK]", message);
  }

  return {
    hookReady: true,
    sent: false,
    queued: false,
    message,
  };
}

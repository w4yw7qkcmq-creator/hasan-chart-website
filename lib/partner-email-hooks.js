import { getSiteUrl, sendTemplateEmail } from "./email";
import { buildEmailParagraph } from "./email-layout.js";

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

  const recipient = String(email || "").trim().toLowerCase();

  if (!recipient) {
    return { hookReady: true, skipped: true, reason: "missing_email" };
  }

  const message = {
    event: normalizedEvent,
    partnerId: String(partnerId || ""),
    userId: String(userId || ""),
    email: recipient,
    subject: subject || null,
    body: body || null,
    payload,
    createdAt: new Date().toISOString(),
  };

  const result = await sendTemplateEmail({
    to: recipient,
    subject: subject || "HasaN CharT World — Partner Program",
    title: subject || "HasaN CharT World",
    content: buildEmailParagraph(body || "لديك تحديث جديد في برنامج الشركاء."),
    actionText: "فتح مركز الشركاء",
    actionUrl: `${getSiteUrl()}/partner-center`,
  });

  return {
    hookReady: true,
    sent: Boolean(result?.success),
    skipped: Boolean(result?.skipped),
    message,
    result,
  };
}

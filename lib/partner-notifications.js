import { sendPartnerEmailHook } from "./partner-email-hooks";

export const PARTNER_NOTIFICATION_TYPES = {
  TIER_UPGRADED: "tier_upgraded",
  COMMISSION_RELEASED: "commission_released",
  WITHDRAW_PAID: "withdraw_paid",
  BONUS_RECEIVED: "bonus_received",
  ACHIEVEMENT_UNLOCKED: "achievement_unlocked",
  LEADERBOARD_CHANGED: "leaderboard_changed",
  WITHDRAWAL_CREATED: "withdrawal_created",
  WITHDRAWAL_APPROVED: "withdrawal_approved",
  WITHDRAWAL_REJECTED: "withdrawal_rejected",
};

export async function createPartnerNotification(
  supabase,
  {
    partnerId,
    userId = null,
    type,
    title,
    body = null,
    payload = {},
    sendEmail = true,
    email = null,
  }
) {
  const normalizedPartnerId = String(partnerId || "").trim();
  const normalizedType = String(type || "").trim();

  if (!normalizedPartnerId || !normalizedType || !title) {
    return { created: false, reason: "invalid_notification" };
  }

  const { data, error } = await supabase
    .from("partner_notifications")
    .insert({
      partner_id: normalizedPartnerId,
      user_id: userId || null,
      type: normalizedType,
      title,
      body,
      payload,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  let emailHook = null;

  if (sendEmail) {
    emailHook = await sendPartnerEmailHook({
      event: normalizedType,
      partnerId: normalizedPartnerId,
      userId,
      email,
      subject: title,
      body,
      payload: {
        ...payload,
        notificationId: data.id,
      },
    });
  }

  return {
    created: true,
    notification: data,
    emailHook,
  };
}

export async function listPartnerNotifications(supabase, partnerId, { limit = 30 } = {}) {
  const { data, error } = await supabase
    .from("partner_notifications")
    .select("id, type, title, body, payload, read_at, created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    payload: row.payload || {},
    readAt: row.read_at,
    createdAt: row.created_at,
    isRead: Boolean(row.read_at),
  }));
}

export async function countUnreadPartnerNotifications(supabase, partnerId) {
  const { count, error } = await supabase
    .from("partner_notifications")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .is("read_at", null);

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

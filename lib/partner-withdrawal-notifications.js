import { getSiteUrl, sendTemplateEmail } from "./email.js";
import { buildEmailParagraph } from "./email-layout.js";
import {
  dispatchAdminSiteNotification,
} from "./site-notification-dispatch.js";
import { createUserNotification } from "./create-user-notification.js";
import { NOTIFICATION_SOUND_KEYS } from "./notification-sound-keys.js";
import { sendTargetedPushNotification } from "./push-notifications.js";
import { createPartnerNotification, PARTNER_NOTIFICATION_TYPES } from "./partner-notifications.js";
import { formatPartnerMoney } from "./partner-shared.js";

const PAYMENT_PROOF_CID = "payment-proof-image";

const WITHDRAWAL_SITE_NOTIFICATION_TYPES = {
  withdrawal_approved: "withdrawal_approved",
  withdrawal_rejected: "withdrawal_rejected",
  withdrawal_paid: "withdraw_paid",
};

const WITHDRAWAL_NOTIFICATION_TYPES = new Set([
  "withdrawal_created",
  "withdrawal_approved",
  "withdrawal_rejected",
  "withdrawal_paid",
]);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_REPLY_TO || "support@hasanchartworld.com";

async function loadPartnerContact(supabase, partnerId) {
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, user_id")
    .eq("id", partnerId)
    .maybeSingle();

  if (partnerError || !partner?.user_id) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, username")
    .eq("id", partner.user_id)
    .maybeSingle();

  if (profileError || !profile?.email) {
    return null;
  }

  return {
    partnerId: partner.id,
    userId: profile.id,
    email: String(profile.email).trim().toLowerCase(),
    username: profile.username || profile.email,
  };
}

function parseDataImage(value) {
  const match = String(value || "")
    .trim()
    .match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    mime: match[1].toLowerCase(),
    base64: match[2],
  };
}

function buildPaymentProofEmailContent(paymentProof) {
  if (!paymentProof) {
    return {
      html: buildEmailParagraph("لم يتم إرفاق صورة إثبات في هذا الطلب."),
      attachments: [],
    };
  }

  const value = String(paymentProof).trim();
  const parsed = parseDataImage(value);

  if (parsed) {
    const ext = parsed.mime.includes("png")
      ? "png"
      : parsed.mime.includes("jpeg") || parsed.mime.includes("jpg")
        ? "jpg"
        : "img";

    return {
      html: `<p style="margin:0 0 12px;font-weight:800;color:#e2e8f0;">إثبات التحويل:</p><img src="cid:${PAYMENT_PROOF_CID}" alt="إثبات التحويل" style="display:block;max-width:100%;height:auto;border-radius:14px;border:1px solid rgba(56,168,242,0.28);" />`,
      attachments: [
        {
          filename: `payment-proof.${ext}`,
          content: parsed.base64,
          content_id: PAYMENT_PROOF_CID,
        },
      ],
    };
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return {
      html: `<p style="margin:0 0 12px;font-weight:800;color:#e2e8f0;">إثبات التحويل:</p><img src="${value}" alt="إثبات التحويل" style="display:block;max-width:100%;height:auto;border-radius:14px;border:1px solid rgba(56,168,242,0.28);" />`,
      attachments: [],
    };
  }

  return {
    html: buildEmailParagraph(
      `<a href="${value}" style="color:#0891b2;font-weight:800;text-decoration:none;">عرض إثبات التحويل</a>`
    ),
    attachments: [],
  };
}

async function dispatchPartnerUserSiteAlert(
  supabase,
  {
    userEmail,
    userId,
    title,
    message,
    url,
    metadata,
    withdrawalId,
    eventType,
  }
) {
  const siteType =
    WITHDRAWAL_SITE_NOTIFICATION_TYPES[eventType] || String(eventType || "system").trim();

  const inApp = await createUserNotification(supabase, {
    userEmail,
    title,
    message,
    type: siteType,
    notificationKey: NOTIFICATION_SOUND_KEYS.SYSTEM,
    url: url || `${getSiteUrl()}/partner-center`,
    metadata: {
      ...(metadata || {}),
      user_id: userId || null,
      event_type: siteType,
      withdrawal_id: withdrawalId || null,
    },
    skipDeliveryGate: true,
  });

  if (inApp.error) {
    console.error("PARTNER_WITHDRAWAL_SITE_NOTIFICATION_FAILED", {
      userEmail,
      userId,
      siteType,
      withdrawalId: withdrawalId || null,
      error: inApp.error?.message || String(inApp.error),
    });
  } else if (inApp.skipped) {
    console.warn("PARTNER_WITHDRAWAL_SITE_NOTIFICATION_SKIPPED", {
      userEmail,
      userId,
      siteType,
      reason: inApp.reason || "unknown",
    });
  } else if (inApp.data?.id) {
    console.log("PARTNER_WITHDRAWAL_SITE_NOTIFICATION_CREATED", {
      id: inApp.data.id,
      userEmail,
      userId,
      siteType,
      withdrawalId: withdrawalId || null,
    });
  }

  let pushResult = { sent: 0, skipped: 1, skipReason: "not-attempted" };

  try {
    pushResult = await sendTargetedPushNotification({
      supabase,
      email: userEmail,
      userId,
      title,
      body: message,
      url: url || `${getSiteUrl()}/notifications`,
      type: "system",
      notificationKey: NOTIFICATION_SOUND_KEYS.SYSTEM,
      tag: withdrawalId ? `partner-withdrawal-${withdrawalId}` : `partner-withdrawal-${Date.now()}`,
      skipDeliveryGate: true,
    });
  } catch (error) {
    pushResult = {
      sent: 0,
      failed: 1,
      skipped: 0,
      skipReason: error?.message || "WEB_PUSH_DISPATCH_FAILED",
    };
  }

  return { inApp, pushResult };
}

function buildWithdrawalSummary({ amount, currency, network, walletAddress, adminNote, partnerNote }) {
  return [
    buildEmailParagraph(`المبلغ: <strong>${formatPartnerMoney(amount)} ${currency || "USDT"}</strong>`),
    buildEmailParagraph(`الشبكة: <strong>${network || "—"}</strong>`),
    buildEmailParagraph(`عنوان المحفظة: <strong>${walletAddress || "—"}</strong>`),
    adminNote ? buildEmailParagraph(`ملاحظة الإدارة: ${adminNote}`) : "",
    partnerNote ? buildEmailParagraph(`ملاحظة الشريك: ${partnerNote}`) : "",
  ]
    .filter(Boolean)
    .join("");
}

export async function notifyPartnerWithdrawalEvent(
  supabase,
  {
    type,
    partnerId,
    withdrawalId,
    amount,
    currency = "USDT",
    network,
    walletAddress,
    status,
    adminNote,
    partnerNote,
    paymentProof = null,
  } = {}
) {
  const normalizedType = String(type || "").trim();

  if (!WITHDRAWAL_NOTIFICATION_TYPES.has(normalizedType)) {
    return { delivered: false, skipped: true, reason: "unknown_type" };
  }

  const payload = {
    type: normalizedType,
    partnerId: String(partnerId || ""),
    withdrawalId: String(withdrawalId || ""),
    amount: Number(amount || 0),
    currency,
    network: network || null,
    walletAddress: walletAddress || null,
    status: status || null,
    adminNote: adminNote || null,
    partnerNote: partnerNote || null,
    paymentProof: paymentProof || null,
    createdAt: new Date().toISOString(),
  };

  const partnerContact = partnerId ? await loadPartnerContact(supabase, partnerId) : null;
  const adminPanelUrl = `${getSiteUrl()}/admin/partners`;
  const partnerCenterUrl = `${getSiteUrl()}/partner-center`;

  if (normalizedType === "withdrawal_created") {
    const summary = buildWithdrawalSummary(payload);
    const partnerLabel = partnerContact?.username || partnerContact?.email || "شريك";

    await sendTemplateEmail({
      to: ADMIN_EMAIL,
      subject: "طلب سحب شريك جديد — HasaN CharT World",
      title: "طلب سحب شريك جديد 💸",
      content: `${buildEmailParagraph(`وصل طلب سحب جديد من <strong>${partnerLabel}</strong>.`)}
        ${summary}
        ${buildEmailParagraph("يرجى مراجعة الطلب من لوحة إدارة الشركاء.")}`,
      actionText: "فتح طلبات السحب",
      actionUrl: adminPanelUrl,
    });

    await dispatchAdminSiteNotification(supabase, {
      preset: "admin",
      title: "طلب سحب شريك جديد 💸",
      message: `${formatPartnerMoney(amount)} ${currency} — ${partnerLabel}`,
      url: adminPanelUrl,
      metadata: { withdrawalId, partnerId, type: normalizedType },
    });

    return { delivered: true, payload };
  }

  if (!partnerContact) {
    return { delivered: false, skipped: true, reason: "missing_partner_contact", payload };
  }

  if (normalizedType === "withdrawal_approved") {
    await createPartnerNotification(supabase, {
      partnerId,
      userId: partnerContact.userId,
      type: PARTNER_NOTIFICATION_TYPES.WITHDRAWAL_APPROVED,
      title: "تم اعتماد طلب السحب",
      body: `تم اعتماد طلب سحب ${formatPartnerMoney(amount)} ${currency}.`,
      payload: { withdrawalId, amount, network, adminNote },
      sendEmail: false,
      email: partnerContact.email,
    });

    await dispatchPartnerUserSiteAlert(supabase, {
      userEmail: partnerContact.email,
      userId: partnerContact.userId,
      title: "تم اعتماد طلب السحب ✅",
      message: `تم اعتماد طلب سحب ${formatPartnerMoney(amount)} ${currency} على شبكة ${network || "—"}.`,
      url: partnerCenterUrl,
      metadata: { withdrawalId, type: normalizedType, amount, network, status },
      withdrawalId,
      eventType: normalizedType,
    });

    await sendTemplateEmail({
      to: partnerContact.email,
      subject: "تم اعتماد طلب السحب — HasaN CharT World",
      title: "تم اعتماد طلب السحب ✅",
      content: `${buildEmailParagraph("تم اعتماد طلب السحب الخاص بك.")}
        ${buildWithdrawalSummary(payload)}
        ${buildEmailParagraph("سيتم تحويل المبلغ بعد تسجيل الدفع من الإدارة.")}`,
      actionText: "فتح مركز الشركاء",
      actionUrl: partnerCenterUrl,
    });

    return { delivered: true, payload };
  }

  if (normalizedType === "withdrawal_rejected") {
    await createPartnerNotification(supabase, {
      partnerId,
      userId: partnerContact.userId,
      type: PARTNER_NOTIFICATION_TYPES.WITHDRAWAL_REJECTED,
      title: "تم رفض طلب السحب",
      body: adminNote || `تم رفض طلب سحب ${formatPartnerMoney(amount)} ${currency}.`,
      payload: { withdrawalId, amount, network, adminNote },
      sendEmail: false,
      email: partnerContact.email,
    });

    await dispatchPartnerUserSiteAlert(supabase, {
      userEmail: partnerContact.email,
      userId: partnerContact.userId,
      title: "تم رفض طلب السحب",
      message:
        adminNote ||
        `تم رفض طلب سحب ${formatPartnerMoney(amount)} ${currency} على شبكة ${network || "—"}.`,
      url: partnerCenterUrl,
      metadata: { withdrawalId, type: normalizedType, amount, network, status },
      withdrawalId,
      eventType: normalizedType,
    });

    await sendTemplateEmail({
      to: partnerContact.email,
      subject: "تم رفض طلب السحب — HasaN CharT World",
      title: "تم رفض طلب السحب",
      content: `${buildEmailParagraph("تم رفض طلب السحب الخاص بك.")}
        ${buildWithdrawalSummary(payload)}
        ${adminNote ? buildEmailParagraph(`سبب الرفض: ${adminNote}`) : ""}`,
      actionText: "فتح مركز الشركاء",
      actionUrl: partnerCenterUrl,
    });

    return { delivered: true, payload };
  }

  if (normalizedType === "withdrawal_paid") {
    const { html: proofHtml, attachments: proofAttachments } =
      buildPaymentProofEmailContent(paymentProof);

    await createPartnerNotification(supabase, {
      partnerId,
      userId: partnerContact.userId,
      type: PARTNER_NOTIFICATION_TYPES.WITHDRAW_PAID,
      title: "تم دفع طلب السحب",
      body: `تم دفع ${formatPartnerMoney(amount)} ${currency} على شبكة ${network || "—"}.`,
      payload: {
        withdrawalId,
        amount,
        network,
        adminNote,
        paymentProof: paymentProof ? true : false,
      },
      sendEmail: false,
      email: partnerContact.email,
    });

    await dispatchPartnerUserSiteAlert(supabase, {
      userEmail: partnerContact.email,
      userId: partnerContact.userId,
      title: "تم دفع طلب السحب 💵",
      message: paymentProof
        ? `تم دفع ${formatPartnerMoney(amount)} ${currency} على شبكة ${network || "—"} — يوجد إثبات تحويل مرفق.`
        : `تم دفع ${formatPartnerMoney(amount)} ${currency} على شبكة ${network || "—"}.`,
      url: partnerCenterUrl,
      metadata: {
        withdrawalId,
        type: normalizedType,
        hasPaymentProof: Boolean(paymentProof),
        amount,
        network,
        status,
      },
      withdrawalId,
      eventType: normalizedType,
    });

    await sendTemplateEmail({
      to: partnerContact.email,
      subject: "تم دفع طلب السحب — HasaN CharT World",
      title: "تم دفع طلب السحب 💵",
      content: `${buildEmailParagraph("تم تحويل مبلغ السحب بنجاح.")}
        ${buildWithdrawalSummary(payload)}
        ${proofHtml}`,
      actionText: "فتح مركز الشركاء",
      actionUrl: partnerCenterUrl,
      attachments: proofAttachments,
    });

    return { delivered: true, payload };
  }

  return { delivered: false, skipped: true, payload };
}

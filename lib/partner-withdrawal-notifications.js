import { getSiteUrl, sendTemplateEmail } from "./email";
import { buildEmailParagraph } from "./email-layout.js";
import {
  dispatchAdminSiteNotification,
  dispatchSiteNotification,
} from "./site-notification-dispatch.js";
import { createPartnerNotification, PARTNER_NOTIFICATION_TYPES } from "./partner-notifications";
import { formatPartnerMoney } from "./partner-shared";

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

function buildPaymentProofHtml(paymentProof) {
  if (!paymentProof) {
    return buildEmailParagraph("لم يتم إرفاق صورة إثبات في هذا الطلب.");
  }

  const value = String(paymentProof).trim();

  if (value.startsWith("data:image")) {
    return `<p style="margin:0 0 12px;font-weight:800;">إثبات التحويل:</p><img src="${value}" alt="إثبات التحويل" style="max-width:100%;border-radius:14px;border:1px solid rgba(56,168,242,0.2);" />`;
  }

  return buildEmailParagraph(
    `<a href="${value}" style="color:#0891b2;font-weight:800;text-decoration:none;">عرض إثبات التحويل</a>`
  );
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

    await dispatchSiteNotification(supabase, {
      userEmail: partnerContact.email,
      userId: partnerContact.userId,
      preset: "system",
      title: "تم اعتماد طلب السحب ✅",
      message: `تم اعتماد طلب سحب ${formatPartnerMoney(amount)} ${currency}.`,
      url: partnerCenterUrl,
      metadata: { withdrawalId, type: normalizedType },
      skipDeliveryGate: true,
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

    await dispatchSiteNotification(supabase, {
      userEmail: partnerContact.email,
      userId: partnerContact.userId,
      preset: "system",
      title: "تم رفض طلب السحب",
      message: adminNote || `تم رفض طلب سحب ${formatPartnerMoney(amount)} ${currency}.`,
      url: partnerCenterUrl,
      metadata: { withdrawalId, type: normalizedType },
      skipDeliveryGate: true,
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
    const proofHtml = buildPaymentProofHtml(paymentProof);

    await createPartnerNotification(supabase, {
      partnerId,
      userId: partnerContact.userId,
      type: PARTNER_NOTIFICATION_TYPES.WITHDRAW_PAID,
      title: "تم دفع طلب السحب",
      body: `تم دفع ${formatPartnerMoney(amount)} ${currency} بنجاح.`,
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

    await dispatchSiteNotification(supabase, {
      userEmail: partnerContact.email,
      userId: partnerContact.userId,
      preset: "system",
      title: "تم دفع طلب السحب 💵",
      message: paymentProof
        ? `تم دفع ${formatPartnerMoney(amount)} ${currency} — يوجد إثبات تحويل مرفق.`
        : `تم دفع ${formatPartnerMoney(amount)} ${currency} بنجاح.`,
      url: partnerCenterUrl,
      metadata: { withdrawalId, type: normalizedType, hasPaymentProof: Boolean(paymentProof) },
      skipDeliveryGate: true,
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
    });

    return { delivered: true, payload };
  }

  return { delivered: false, skipped: true, payload };
}

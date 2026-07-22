import {
  buildEmailLogoHtml,
  EMAIL_SITE_NAME,
  getEmailLogoUrl,
} from "./email-branding.js";

export const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";
export const EMAIL_LAYOUT_VERSION = "hasan-chart-dark-v2";

export const EMAIL_BRAND = {
  siteName: EMAIL_SITE_NAME,
  siteUrl: DEFAULT_SITE_URL,
  gradient: "linear-gradient(135deg,#06b6d4,#2563eb)",
  gradientHover: "linear-gradient(135deg,#0891b2,#1d4ed8)",
  cardRadius: "22px",
  buttonRadius: "16px",
  fontFamily: "'Cairo','Segoe UI',Tahoma,Arial,'Helvetica Neue',sans-serif",
};

const TONE_STYLES = {
  cyan: { background: "#0b1b3a", border: "#164e63", title: "#93c5fd" },
  green: { background: "#052e21", border: "#166534", title: "#86efac" },
  red: { background: "#3f1515", border: "#991b1b", title: "#fca5a5" },
  blue: { background: "#0c1a3a", border: "#1e40af", title: "#93c5fd" },
};

function buildEmailStyles() {
  return `
<style type="text/css">
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
  body, table, td, p, a, h1, h2, h3, div, span {
    font-family: ${EMAIL_BRAND.fontFamily};
  }
  .email-shell {
    width: 100%;
    max-width: 560px;
  }
  .email-btn a:hover {
    background: ${EMAIL_BRAND.gradientHover} !important;
    box-shadow: 0 12px 34px rgba(29,78,216,0.36) !important;
  }
  @media only screen and (max-width: 620px) {
    .email-outer {
      padding: 12px 6px !important;
    }
    .email-shell {
      width: 100% !important;
      max-width: 100% !important;
      border-radius: 18px !important;
    }
    .email-header {
      padding: 24px 16px !important;
    }
    .email-content {
      padding: 20px 14px !important;
    }
    .email-title {
      font-size: 22px !important;
      line-height: 1.5 !important;
    }
    .email-site-name {
      font-size: 24px !important;
    }
    .email-btn td {
      display: block !important;
      width: 100% !important;
    }
    .email-btn a {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      text-align: center !important;
    }
    .email-footer {
      padding: 16px 14px !important;
    }
  }
</style>
  `.trim();
}

export function escapeEmailHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br />");
}

function stripHtmlForPreheader(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildEmailPreheader(text) {
  const safeText = escapeEmailHtml(stripHtmlForPreheader(text));
  if (!safeText) return "";

  const padded = `${safeText}${"&nbsp;".repeat(120)}`;

  return `
<div style="display:none;font-size:1px;color:#020617;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;" dir="rtl">
  ${padded}
</div>
  `.trim();
}

export function buildEmailHeader({ siteUrl = DEFAULT_SITE_URL, headerSubtitle = EMAIL_SITE_NAME }) {
  const logoHtml = buildEmailLogoHtml(siteUrl);

  return `
<td align="center" class="email-header" dir="rtl" style="background:${EMAIL_BRAND.gradient};padding:28px 18px;border-radius:${EMAIL_BRAND.cardRadius} ${EMAIL_BRAND.cardRadius} 0 0;">
  ${logoHtml}
  <div class="email-site-name" style="font-size:28px;font-weight:900;color:#ffffff;line-height:1.4;font-family:${EMAIL_BRAND.fontFamily};">${EMAIL_SITE_NAME}</div>
  <div style="margin-top:10px;font-size:14px;color:#e0f2fe;line-height:1.8;font-family:${EMAIL_BRAND.fontFamily};">${headerSubtitle}</div>
</td>
  `.trim();
}

export function buildEmailDivider() {
  return `
<tr>
<td dir="rtl" style="padding:0 24px;background:#07142f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td style="height:1px;background:linear-gradient(90deg,transparent,#334155 20%,#67e8f9 50%,#334155 80%,transparent);font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
</td>
</tr>
  `.trim();
}

export function buildEmailFooter({ siteUrl = DEFAULT_SITE_URL } = {}) {
  const safeUrl = String(siteUrl || DEFAULT_SITE_URL).replace(/\/$/, "");

  return `
<td align="center" class="email-footer" dir="rtl" style="padding:20px 18px;background:#020617;color:#94a3b8;font-size:13px;line-height:2;font-family:${EMAIL_BRAND.fontFamily};">
  <div style="color:#cbd5e1;font-size:13px;line-height:2;">© ${EMAIL_SITE_NAME}</div>
  <div style="margin-top:4px;">
    <a href="${safeUrl}" style="color:#67e8f9;text-decoration:none;font-weight:700;font-size:13px;">${safeUrl}</a>
  </div>
</td>
  `.trim();
}

export function buildEmailParagraph(text, { muted = false, centered = false } = {}) {
  const color = muted ? "#94a3b8" : "#e2e8f0";
  const align = centered ? "center" : "right";

  return `<p dir="rtl" style="margin:0 0 14px;color:${color};font-size:16px;line-height:1.9;text-align:${align};font-family:${EMAIL_BRAND.fontFamily};">${text}</p>`;
}

export function buildEmailHeading(text, { level = 2 } = {}) {
  const sizes = { 1: "26px", 2: "24px", 3: "20px" };
  const size = sizes[level] || sizes[2];

  return `<h${level} dir="rtl" style="margin:0 0 16px;color:#ffffff;font-size:${size};line-height:1.5;font-weight:900;text-align:right;font-family:${EMAIL_BRAND.fontFamily};">${text}</h${level}>`;
}

export function buildEmailDataPanel(html) {
  return `
<div dir="rtl" style="background:#020617;border:1px solid #164e63;border-radius:18px;padding:18px 20px;color:#e2e8f0;font-size:16px;line-height:2;text-align:right;font-family:${EMAIL_BRAND.fontFamily};">
  ${html || ""}
</div>
  `.trim();
}

export function buildEmailHighlightCard({ label, value, valueColor = "#67e8f9" }) {
  return `
<div dir="rtl" style="background:#111c33;border:1px solid #263a5c;border-radius:18px;padding:22px;text-align:center;margin-bottom:16px;">
  <div style="font-size:14px;color:#94a3b8;margin-bottom:10px;font-family:${EMAIL_BRAND.fontFamily};">${label}</div>
  <div style="font-size:32px;font-weight:900;color:${valueColor};line-height:1.3;word-break:break-word;font-family:${EMAIL_BRAND.fontFamily};">${value}</div>
</div>
  `.trim();
}

export function buildEmailDetailRows(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const rowHtml = safeRows
    .map((row, index) => {
      const isLast = index === safeRows.length - 1;
      const border = isLast ? "" : "border-bottom:1px solid rgba(148,163,184,0.14);";
      const valueColor = row.valueColor || "#e2e8f0";
      const valueSize = row.emphasis ? "24px" : "22px";
      const valueWeight = row.emphasis ? "900" : "800";

      return `
<tr>
  <td dir="rtl" style="padding:10px 0;${border}">
    <div style="font-size:13px;color:#94a3b8;margin-bottom:6px;font-family:${EMAIL_BRAND.fontFamily};">${row.label}</div>
    <div style="font-size:${valueSize};font-weight:${valueWeight};color:${valueColor};word-break:break-word;font-family:${EMAIL_BRAND.fontFamily};">${row.value}</div>
  </td>
</tr>`;
    })
    .join("");

  return `
<div dir="rtl" style="background:#020617;border:1px solid #164e63;border-radius:18px;padding:18px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="border-collapse:collapse;">
    ${rowHtml}
  </table>
</div>
  `.trim();
}

export function buildEmailToneCard({ tone = "cyan", title, body }) {
  const palette = TONE_STYLES[tone] || TONE_STYLES.cyan;

  return `
<div dir="rtl" style="background:${palette.background};border:1px solid ${palette.border};border-radius:16px;padding:14px 16px;margin-bottom:12px;text-align:right;">
  <div style="color:${palette.title};font-size:14px;font-weight:800;margin-bottom:8px;font-family:${EMAIL_BRAND.fontFamily};">${title}</div>
  <div style="color:#e2e8f0;font-size:15px;line-height:1.9;word-break:break-word;font-family:${EMAIL_BRAND.fontFamily};">${body}</div>
</div>
  `.trim();
}

export function buildEmailActionButton({ text, url }) {
  if (!text || !url) return "";

  return `
<table role="presentation" class="email-btn" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="margin-top:24px;border-collapse:collapse;">
  <tr>
    <td align="center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="33%" stroke="f" fillcolor="#2563eb">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Tahoma,sans-serif;font-size:16px;font-weight:bold;">${text}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${url}" class="email-btn-link" style="display:inline-block;min-width:220px;background:${EMAIL_BRAND.gradient};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:${EMAIL_BRAND.buttonRadius};font-weight:900;font-size:16px;line-height:1.2;text-align:center;box-shadow:0 10px 30px rgba(37,99,235,0.28);font-family:${EMAIL_BRAND.fontFamily};">
        ${text}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>
  `.trim();
}

export function buildEmailSecondaryActionButton({ text, url }) {
  if (!text || !url) return "";

  return `
<table role="presentation" class="email-btn email-btn--secondary" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="margin-top:12px;border-collapse:collapse;">
  <tr>
    <td align="center">
      <a href="${url}" class="email-btn-link email-btn-link--secondary" style="display:inline-block;min-width:220px;background:rgba(15,23,42,0.35);color:#e2e8f0;text-decoration:none;padding:12px 28px;border-radius:${EMAIL_BRAND.buttonRadius};font-weight:800;font-size:15px;line-height:1.2;text-align:center;border:1px solid rgba(148,163,184,0.35);font-family:${EMAIL_BRAND.fontFamily};">
        ${text}
      </a>
    </td>
  </tr>
</table>
  `.trim();
}

export function buildEmailDualActionButtons({
  primaryText = "",
  primaryUrl = "",
  secondaryText = "",
  secondaryUrl = "",
} = {}) {
  return [
    buildEmailActionButton({ text: primaryText, url: primaryUrl }),
    buildEmailSecondaryActionButton({ text: secondaryText, url: secondaryUrl }),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUnifiedEmailLayout({
  siteUrl = DEFAULT_SITE_URL,
  headerSubtitle = EMAIL_SITE_NAME,
  title,
  subtitle = "",
  preheader = "",
  bodyHtml = "",
  actionText = "",
  actionUrl = "",
  secondaryActionText = "",
  secondaryActionUrl = "",
  actionButtonsHtml = "",
}) {
  const safeTitle = title || EMAIL_SITE_NAME;
  const safePreheader =
    preheader ||
    stripHtmlForPreheader(subtitle) ||
    `${stripHtmlForPreheader(safeTitle)} — ${EMAIL_SITE_NAME}`;

  const subtitleBlock = subtitle
    ? `<p dir="rtl" style="margin:0 0 18px;color:#94a3b8;font-size:15px;line-height:1.9;text-align:center;font-family:${EMAIL_BRAND.fontFamily};">${subtitle}</p>`
    : "";

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
  <title>${escapeEmailHtml(safeTitle)}</title>
  ${buildEmailStyles()}
</head>
<body dir="rtl" style="margin:0;padding:0;background:#020617;font-family:${EMAIL_BRAND.fontFamily};direction:rtl;text-align:right;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${buildEmailPreheader(safePreheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" class="email-outer" style="background:#020617;padding:20px 8px;width:100%;direction:rtl;">
<tr>
<td align="center" dir="rtl">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" class="email-shell" style="max-width:560px;background:#07142f;border:1px solid #1e3a5f;border-radius:${EMAIL_BRAND.cardRadius};overflow:hidden;direction:rtl;">
<tr>
${buildEmailHeader({ siteUrl, headerSubtitle })}
</tr>
<tr>
<td dir="rtl" class="email-content" style="padding:22px 16px;direction:rtl;text-align:right;">
<h1 dir="rtl" class="email-title" style="margin:0 0 18px;color:#ffffff;font-size:26px;line-height:1.6;font-weight:900;text-align:center;font-family:${EMAIL_BRAND.fontFamily};">${safeTitle}</h1>
${subtitleBlock}
<div dir="rtl" style="color:#e2e8f0;font-size:16px;line-height:2;text-align:right;font-family:${EMAIL_BRAND.fontFamily};">
${bodyHtml}
</div>
${
  actionButtonsHtml ||
  [
    buildEmailActionButton({ text: actionText, url: actionUrl }),
    buildEmailSecondaryActionButton({
      text: secondaryActionText,
      url: secondaryActionUrl,
    }),
  ]
    .filter(Boolean)
    .join("\n")
}
</td>
</tr>
${buildEmailDivider()}
<tr>
${buildEmailFooter({ siteUrl })}
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
  `.trim();
}

export function buildAnalysisReplyEmailHtml({
  coin,
  reply,
  siteUrl = DEFAULT_SITE_URL,
  actionUrl = `${DEFAULT_SITE_URL}/my-analysis`,
}) {
  const safeCoin = escapeEmailHtml(coin || "العملة");
  const safeReply = escapeEmailHtml(reply || "");

  return buildUnifiedEmailLayout({
    siteUrl,
    headerSubtitle: "تحليلات HasaN CharT World",
    title: "📩 تم الرد على طلب التحليل",
    subtitle: "يمكنك مشاهدة الرد الكامل داخل حسابك في المنصة",
    preheader: `تم الرد على طلب تحليل ${safeCoin} — اطلع على التفاصيل داخل حسابك`,
    bodyHtml: `
${buildEmailHighlightCard({ label: "العملة المطلوبة", value: safeCoin })}
${buildEmailDataPanel(safeReply)}
    `.trim(),
    actionText: "مشاهدة التحليل",
    actionUrl,
  });
}

export function buildVipSignalEmailContent({ coin, entry, targets, stopLoss, notes }) {
  const notesBlock = notes
    ? buildEmailToneCard({
        tone: "blue",
        title: "ملاحظات",
        body: escapeEmailHtml(String(notes)),
      })
    : "";

  return `
${buildEmailHeading(escapeEmailHtml(coin || "العملة"), { level: 2 })}
${buildEmailToneCard({ tone: "cyan", title: "منطقة الدخول", body: escapeEmailHtml(entry || "غير محدد") })}
${buildEmailToneCard({ tone: "green", title: "الأهداف", body: escapeEmailHtml(String(targets || "غير محدد")) })}
${buildEmailToneCard({ tone: "red", title: "وقف الخسارة", body: escapeEmailHtml(stopLoss || "غير محدد") })}
${notesBlock}
${buildEmailParagraph("هذه الرسالة مخصصة للمشتركين في توصيات VIP. يرجى الالتزام بإدارة رأس المال.", { muted: true })}
  `.trim();
}

export function buildSubscriptionExpiryEmailContent({ planName, message, variant = "reminder" }) {
  const safePlan = escapeEmailHtml(planName || "اشتراك VIP");
  const safeMessage = escapeEmailHtml(message || "");

  if (variant === "expired") {
    return `
${buildEmailParagraph("انتهت صلاحية الباقة التالية:")}
${buildEmailHighlightCard({ label: "الباقة", value: safePlan, valueColor: "#fca5a5" })}
${buildEmailParagraph("تم إيقاف الوصول إلى خدمات VIP بسبب انتهاء مدة الاشتراك.")}
${buildEmailParagraph("يمكنك تجديد الاشتراك للعودة إلى التوصيات والخدمات المميزة.")}
    `.trim();
  }

  return `
${buildEmailParagraph("مرحباً،")}
${buildEmailParagraph(safeMessage)}
${buildEmailHighlightCard({ label: "الباقة", value: safePlan })}
${buildEmailParagraph("للاستمرار بالوصول إلى توصيات VIP والخدمات المميزة، يمكنك تجديد اشتراكك الآن.")}
  `.trim();
}

export const SUBSCRIPTION_REJECTED_SUPPORT_URL = "https://t.me/HasaNCharTSupport";

export function formatSubscriptionRejectedShortRequestId(requestId) {
  const normalized = String(requestId || "").trim();
  if (!normalized) return "—";
  return normalized.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function formatSubscriptionRejectedCreatedAt(createdAt) {
  if (!createdAt) return "—";

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("ar-SY-u-nu-latn");
}

export function buildSubscriptionRejectedEmailContent({
  username,
  planName,
  price,
  createdAt,
  rejectionReason,
  adminNotes,
  requestId,
}) {
  const safeUsername = escapeEmailHtml(username || "عضونا");
  const safePlan = escapeEmailHtml(planName || "—");
  const safePrice = escapeEmailHtml(price || "—");
  const safeCreatedAt = escapeEmailHtml(formatSubscriptionRejectedCreatedAt(createdAt));
  const safeReason = escapeEmailHtml(rejectionReason || "—");
  const safeNotes = escapeEmailHtml(adminNotes || "لا توجد ملاحظات إضافية");
  const safeRequestId = escapeEmailHtml(formatSubscriptionRejectedShortRequestId(requestId));

  return `
${buildEmailParagraph(`مرحباً <strong style="color:#ffffff;">${safeUsername}</strong>،`)}
${buildEmailParagraph(`بعد مراجعة طلب اشتراكك في باقة <strong style="color:#ffffff;">${safePlan}</strong>، تعذر اعتماد الطلب في الوقت الحالي.`)}
${buildEmailToneCard({
  tone: "red",
  title: "سبب الرفض",
  body: safeReason,
})}
${buildEmailToneCard({
  tone: "blue",
  title: "ملاحظات الإدارة",
  body: safeNotes,
})}
${buildEmailParagraph("تفاصيل الطلب:")}
${buildEmailDataPanel(`
${buildEmailDetailRows([
  { label: "الباقة", value: safePlan },
  { label: "المبلغ", value: safePrice },
  { label: "تاريخ الطلب", value: safeCreatedAt },
  { label: "رقم الطلب", value: safeRequestId },
])}
`)}
${buildEmailToneCard({
  tone: "red",
  title: "تنبيه مهم",
  body: "لم يتم تفعيل الاشتراك، ولم يُعتمد المبلغ. يمكنك التواصل مع الدعم الفني أو إعادة إرسال إثبات دفع صحيح بعد معالجة سبب الرفض.",
})}
${buildEmailParagraph("الدعم الفني:", { muted: true })}
${buildEmailParagraph(`Telegram: <a href="${SUBSCRIPTION_REJECTED_SUPPORT_URL}" style="color:#67e8f9;text-decoration:none;font-weight:800;">${SUBSCRIPTION_REJECTED_SUPPORT_URL}</a>`)}
${buildEmailParagraph("مع التحية،<br /><strong style=\"color:#ffffff;\">فريق HasaN CharT World</strong>", { muted: true })}
  `.trim();
}

export function buildAdminSubscriptionRequestEmailContent({
  planName,
  category,
  price,
  userEmail,
  username,
  telegramUsername,
  paymentProofHtml,
}) {
  return `
${buildEmailParagraph("وصل طلب اشتراك جديد في باقات التوصيات.")}
${buildEmailDetailRows([
  { label: "الباقة", value: escapeEmailHtml(planName) },
  { label: "القسم", value: escapeEmailHtml(category) },
  { label: "السعر", value: escapeEmailHtml(price) },
  { label: "البريد", value: escapeEmailHtml(userEmail) },
  { label: "اسم المستخدم", value: escapeEmailHtml(username || "غير متوفر") },
  { label: "تليجرام", value: escapeEmailHtml(telegramUsername) },
  { label: "إثبات الدفع", value: paymentProofHtml },
])}
  `.trim();
}

export function buildAdminAccountRequestEmailContent({
  email,
  platform,
  capital,
  accountType,
  contactMethod,
}) {
  return `
${buildEmailParagraph("وصل طلب إدارة حساب جديد من أحد المستخدمين.")}
${buildEmailDetailRows([
  { label: "البريد", value: escapeEmailHtml(email) },
  { label: "المنصة", value: escapeEmailHtml(platform) },
  { label: "رأس المال", value: escapeEmailHtml(capital) },
  { label: "نوع الحساب", value: escapeEmailHtml(accountType || "غير محدد") },
  { label: "طريقة التواصل", value: escapeEmailHtml(contactMethod || "غير محددة") },
])}
  `.trim();
}

export function buildPriceAlertEmailLayoutHtml({
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
  actionUrl,
  siteUrl = DEFAULT_SITE_URL,
}) {
  const safeCoin = escapeEmailHtml(coinLabel || "العملة");

  return buildUnifiedEmailLayout({
    siteUrl,
    headerSubtitle: "تنبيهات الأسعار الذكية",
    title: "🔔 وصل السعر إلى هدف التنبيه",
    subtitle: "تم تفعيل التنبيه لأن السعر وصل إلى المستوى الذي حددته داخل المنصة.",
    preheader: `تنبيه سعر ${safeCoin} — وصل السعر إلى الهدف المطلوب`,
    bodyHtml: `
${buildEmailHighlightCard({ label: "العملة", value: safeCoin })}
${buildEmailDetailRows([
  { label: "السعر الذي طلبته", value: escapeEmailHtml(String(targetPrice ?? "")) },
  {
    label: "السعر الحالي عند التفعيل",
    value: escapeEmailHtml(String(currentPrice ?? "")),
    valueColor: "#34d399",
    emphasis: true,
  },
  { label: "نوع التنبيه", value: escapeEmailHtml(String(conditionLabel ?? "")) },
])}
    `.trim(),
    actionText: "فتح تنبيهات الأسعار",
    actionUrl,
  });
}

export { buildEmailLogoHtml, getEmailLogoUrl };

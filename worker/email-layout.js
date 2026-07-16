const { buildEmailLogoHtml, EMAIL_SITE_NAME } = require("./email-branding");

const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";
const EMAIL_LAYOUT_VERSION = "hasan-chart-dark-v2";

const EMAIL_BRAND = {
  siteName: EMAIL_SITE_NAME,
  siteUrl: DEFAULT_SITE_URL,
  gradient: "linear-gradient(135deg,#06b6d4,#2563eb)",
  gradientHover: "linear-gradient(135deg,#0891b2,#1d4ed8)",
  cardRadius: "22px",
  buttonRadius: "16px",
  fontFamily: "'Cairo','Segoe UI',Tahoma,Arial,'Helvetica Neue',sans-serif",
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

function escapeEmailHtml(value) {
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

function buildEmailPreheader(text) {
  const safeText = escapeEmailHtml(stripHtmlForPreheader(text));
  if (!safeText) return "";

  const padded = `${safeText}${"&nbsp;".repeat(120)}`;

  return `
<div style="display:none;font-size:1px;color:#020617;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;" dir="rtl">
  ${padded}
</div>
  `.trim();
}

function buildEmailHeader({ siteUrl = DEFAULT_SITE_URL, headerSubtitle = EMAIL_SITE_NAME }) {
  const logoHtml = buildEmailLogoHtml(siteUrl);

  return `
<td align="center" class="email-header" dir="rtl" style="background:${EMAIL_BRAND.gradient};padding:28px 18px;border-radius:${EMAIL_BRAND.cardRadius} ${EMAIL_BRAND.cardRadius} 0 0;">
  ${logoHtml}
  <div class="email-site-name" style="font-size:28px;font-weight:900;color:#ffffff;line-height:1.4;font-family:${EMAIL_BRAND.fontFamily};">${EMAIL_SITE_NAME}</div>
  <div style="margin-top:10px;font-size:14px;color:#e0f2fe;line-height:1.8;font-family:${EMAIL_BRAND.fontFamily};">${headerSubtitle}</div>
</td>
  `.trim();
}

function buildEmailDivider() {
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

function buildEmailFooter({ siteUrl = DEFAULT_SITE_URL } = {}) {
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

function buildEmailHighlightCard({ label, value, valueColor = "#67e8f9" }) {
  return `
<div dir="rtl" style="background:#111c33;border:1px solid #263a5c;border-radius:18px;padding:22px;text-align:center;margin-bottom:16px;">
  <div style="font-size:14px;color:#94a3b8;margin-bottom:10px;font-family:${EMAIL_BRAND.fontFamily};">${label}</div>
  <div style="font-size:32px;font-weight:900;color:${valueColor};line-height:1.3;word-break:break-word;font-family:${EMAIL_BRAND.fontFamily};">${value}</div>
</div>
  `.trim();
}

function buildEmailDetailRows(rows = []) {
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

function buildEmailActionButton({ text, url }) {
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

function buildUnifiedEmailLayout({
  siteUrl = DEFAULT_SITE_URL,
  headerSubtitle = EMAIL_SITE_NAME,
  title,
  subtitle = "",
  preheader = "",
  bodyHtml = "",
  actionText = "",
  actionUrl = "",
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
${buildEmailActionButton({ text: actionText, url: actionUrl })}
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

function buildEmailParagraph(text, { muted = false } = {}) {
  const color = muted ? "#94a3b8" : "#e2e8f0";

  return `<p dir="rtl" style="margin:0 0 14px;color:${color};font-size:16px;line-height:2;font-family:${EMAIL_BRAND.fontFamily};">${escapeEmailHtml(text)}</p>`;
}

function buildSubscriptionExpiryEmailContent({ planName, message, variant = "reminder" }) {
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

function buildPriceAlertEmailLayoutHtml({
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

module.exports = {
  DEFAULT_SITE_URL,
  EMAIL_LAYOUT_VERSION,
  EMAIL_BRAND,
  escapeEmailHtml,
  buildEmailParagraph,
  buildEmailHighlightCard,
  buildEmailDetailRows,
  buildEmailActionButton,
  buildUnifiedEmailLayout,
  buildSubscriptionExpiryEmailContent,
  buildPriceAlertEmailLayoutHtml,
};

const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";
const EMAIL_LOGO_URL = `${DEFAULT_SITE_URL}/favicon.png`;
const EMAIL_SITE_NAME = "HasaN CharT World";
const EMAIL_LOGO_ALT = "شعار HasaN CharT World";

const EMAIL_BRAND = {
  siteName: EMAIL_SITE_NAME,
  siteUrl: DEFAULT_SITE_URL,
  gradient: "linear-gradient(135deg,#06b6d4,#2563eb)",
  gradientHover: "linear-gradient(135deg,#0891b2,#1d4ed8)",
  cardRadius: "22px",
  buttonRadius: "16px",
  fontFamily: "'Cairo','Segoe UI',Tahoma,Arial,'Helvetica Neue',sans-serif",
};

function escapeEmailHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br />");
}

function stripHtmlForPreheader(value: unknown) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function buildEmailLogoHtml() {
  return `<img src="${EMAIL_LOGO_URL}" alt="${EMAIL_LOGO_ALT}" title="${EMAIL_SITE_NAME}" width="64" height="64" style="display:block;border:0;border-radius:16px;margin:0 auto 16px;max-width:64px;height:auto;" />`;
}

function buildEmailPreheader(text: string) {
  const safeText = escapeEmailHtml(stripHtmlForPreheader(text));
  if (!safeText) return "";

  const padded = `${safeText}${"&nbsp;".repeat(120)}`;

  return `
<div style="display:none;font-size:1px;color:#020617;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;" dir="rtl">
  ${padded}
</div>
  `.trim();
}

function buildEmailHeader({ headerSubtitle = EMAIL_SITE_NAME }: { headerSubtitle?: string }) {
  const logoHtml = buildEmailLogoHtml();

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

function buildEmailFooter() {
  const safeUrl = DEFAULT_SITE_URL;

  return `
<td align="center" class="email-footer" dir="rtl" style="padding:20px 18px;background:#020617;color:#94a3b8;font-size:13px;line-height:2;font-family:${EMAIL_BRAND.fontFamily};">
  <div style="color:#cbd5e1;font-size:13px;line-height:2;">© ${EMAIL_SITE_NAME}</div>
  <div style="margin-top:4px;">
    <a href="${safeUrl}" style="color:#67e8f9;text-decoration:none;font-weight:700;font-size:13px;">${safeUrl}</a>
  </div>
</td>
  `.trim();
}

function buildEmailHighlightCard({
  label,
  value,
  valueColor = "#67e8f9",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return `
<div dir="rtl" style="background:#111c33;border:1px solid #263a5c;border-radius:18px;padding:22px;text-align:center;margin-bottom:16px;">
  <div style="font-size:14px;color:#94a3b8;margin-bottom:10px;font-family:${EMAIL_BRAND.fontFamily};">${label}</div>
  <div style="font-size:32px;font-weight:900;color:${valueColor};line-height:1.3;word-break:break-word;font-family:${EMAIL_BRAND.fontFamily};">${value}</div>
</div>
  `.trim();
}

function buildEmailDataPanel(html: string) {
  return `
<div dir="rtl" style="background:#020617;border:1px solid #164e63;border-radius:18px;padding:18px 20px;color:#e2e8f0;font-size:16px;line-height:2;text-align:right;font-family:${EMAIL_BRAND.fontFamily};">
  ${html || ""}
</div>
  `.trim();
}

function buildEmailActionButton({ text, url }: { text: string; url: string }) {
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

export function buildUnifiedEmailLayout({
  headerSubtitle = EMAIL_SITE_NAME,
  title,
  subtitle = "",
  preheader = "",
  bodyHtml = "",
  actionText = "",
  actionUrl = "",
}: {
  headerSubtitle?: string;
  title: string;
  subtitle?: string;
  preheader?: string;
  bodyHtml?: string;
  actionText?: string;
  actionUrl?: string;
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
${buildEmailPreheader(String(safePreheader))}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" class="email-outer" style="background:#020617;padding:20px 8px;width:100%;direction:rtl;">
<tr>
<td align="center" dir="rtl">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" class="email-shell" style="max-width:560px;background:#07142f;border:1px solid #1e3a5f;border-radius:${EMAIL_BRAND.cardRadius};overflow:hidden;direction:rtl;">
<tr>
${buildEmailHeader({ headerSubtitle })}
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
${buildEmailFooter()}
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
  actionUrl = `${DEFAULT_SITE_URL}/my-analysis`,
}: {
  coin: string;
  reply: string;
  actionUrl?: string;
}) {
  const safeCoin = escapeEmailHtml(coin || "العملة");
  const safeReply = escapeEmailHtml(reply || "");

  return buildUnifiedEmailLayout({
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

export { escapeEmailHtml };

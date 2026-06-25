const { buildEmailLogoHtml } = require("./email-branding");

const PRICE_ALERT_FROM = "HasaN CharT Alerts <alerts@hasanchartworld.com>";
const PRICE_ALERT_CTA_URL = "https://www.hasanchartworld.com/alerts";

function buildPriceAlertEmailPayload({
  email,
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
  alertId = null,
}) {
  const safeCoin = String(coinLabel || "");
  const safeConditionLabel = String(conditionLabel || "");
  const safeTargetPrice = String(targetPrice ?? "");
  const safeCurrentPrice = String(currentPrice ?? "");
  const logoHtml = buildEmailLogoHtml();

  return {
    from: PRICE_ALERT_FROM,
    to: email,
    subject: `🔔 وصل السعر إلى هدف التنبيه - ${safeCoin}`,
    tags: [
      { name: "message_type", value: "price-alert" },
      { name: "category", value: "price-alert" },
    ],
    html: `
<div style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;width:100%;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;background:#07142f;border-radius:24px;overflow:hidden;border:1px solid rgba(34,211,238,0.18);box-shadow:0 0 40px rgba(37,99,235,0.22);">
          <tr>
            <td style="background:linear-gradient(135deg,#07142f 0%,#0b63ff 55%,#06b6d4 100%);padding:34px 22px;text-align:center;">
              ${logoHtml}
              <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.6;font-weight:900;text-align:center;">
                🔔 وصل السعر إلى هدف التنبيه
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 20px 10px;">
              <div style="background:#020817;border:1px solid rgba(34,211,238,0.16);border-radius:20px;padding:22px;color:#e2e8f0;font-size:18px;line-height:2;font-weight:600;text-align:right;">
                <p style="margin:0 0 8px;"><strong>العملة:</strong> ${safeCoin}</p>
                <p style="margin:0 0 8px;"><strong>السعر الذي طلبته:</strong> ${safeTargetPrice}</p>
                <p style="margin:0 0 8px;"><strong>السعر الحالي عند التفعيل:</strong> ${safeCurrentPrice}</p>
                <p style="margin:0 0 8px;"><strong>نوع التنبيه:</strong> ${safeConditionLabel}</p>
                <p style="margin:16px 0 0;color:#94a3b8;font-size:15px;">تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 20px 34px;">
              <a href="${PRICE_ALERT_CTA_URL}" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#2563eb);color:#ffffff;text-decoration:none;padding:18px 34px;border-radius:18px;font-size:17px;font-weight:900;box-shadow:0 0 22px rgba(37,99,235,0.35);">
                فتح تنبيهات الأسعار
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
    `.trim(),
    alertId,
  };
}

module.exports = {
  PRICE_ALERT_FROM,
  PRICE_ALERT_CTA_URL,
  buildPriceAlertEmailPayload,
};

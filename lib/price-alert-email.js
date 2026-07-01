export const PRICE_ALERT_FROM = "HasaN CharT Alerts <alerts@hasanchartworld.com>";
export const PRICE_ALERT_CTA_URL = "https://www.hasanchartworld.com/alerts";
export const PRICE_ALERT_EMAIL_TEMPLATE = "dark-compact-v1";

function buildPriceAlertEmailHtml({
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
}) {
  const safeCoin = String(coinLabel || "");
  const safeConditionLabel = String(conditionLabel || "");
  const safeTargetPrice = String(targetPrice ?? "");
  const safeCurrentPrice = String(currentPrice ?? "");

  return `
<div style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;width:100%;padding:20px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:520px;background:#07142f;border-radius:18px;overflow:hidden;border:1px solid rgba(34,211,238,0.16);">
          <tr>
            <td style="padding:22px 20px 14px;border-bottom:1px solid rgba(34,211,238,0.12);background:#020817;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.6;font-weight:900;text-align:right;">
                🔔 وصل السعر إلى هدف التنبيه
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 20px;color:#cbd5e1;font-size:16px;line-height:1.9;font-weight:600;text-align:right;">
              <p style="margin:0 0 6px;"><strong style="color:#e2e8f0;">العملة:</strong> ${safeCoin}</p>
              <p style="margin:0 0 6px;"><strong style="color:#e2e8f0;">السعر الذي طلبته:</strong> ${safeTargetPrice}</p>
              <p style="margin:0 0 6px;"><strong style="color:#e2e8f0;">السعر الحالي عند التفعيل:</strong> ${safeCurrentPrice}</p>
              <p style="margin:0 0 6px;"><strong style="color:#e2e8f0;">نوع التنبيه:</strong> ${safeConditionLabel}</p>
              <p style="margin:12px 0 0;color:#94a3b8;font-size:14px;line-height:1.8;">تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 20px 22px;">
              <a href="${PRICE_ALERT_CTA_URL}" style="display:inline-block;background:#0f172a;border:1px solid rgba(34,211,238,0.24);color:#e2e8f0;text-decoration:none;padding:14px 24px;border-radius:14px;font-size:15px;font-weight:800;">
                فتح تنبيهات الأسعار
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
  `.trim();
}

function buildPriceAlertEmailText({
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
}) {
  return [
    "🔔 وصل السعر إلى هدف التنبيه",
    "",
    `العملة: ${coinLabel || ""}`,
    `السعر الذي طلبته: ${targetPrice ?? ""}`,
    `السعر الحالي عند التفعيل: ${currentPrice ?? ""}`,
    `نوع التنبيه: ${conditionLabel || ""}`,
    "",
    "تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.",
    "",
    PRICE_ALERT_CTA_URL,
  ].join("\n");
}

export function buildPriceAlertEmailPayload({
  email,
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
  alertId = null,
}) {
  const safeCoin = String(coinLabel || "");
  const subject = `🔔 وصل السعر إلى هدف التنبيه - ${safeCoin}`;

  return {
    from: PRICE_ALERT_FROM,
    to: email,
    subject,
    tags: [
      { name: "message_type", value: "price-alert" },
      { name: "category", value: "price-alert" },
      { name: "template", value: PRICE_ALERT_EMAIL_TEMPLATE },
    ],
    html: buildPriceAlertEmailHtml({
      coinLabel,
      conditionLabel,
      targetPrice,
      currentPrice,
    }),
    text: buildPriceAlertEmailText({
      coinLabel,
      conditionLabel,
      targetPrice,
      currentPrice,
    }),
    alertId,
  };
}

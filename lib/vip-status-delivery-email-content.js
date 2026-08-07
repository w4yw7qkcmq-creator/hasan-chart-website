import {
  buildEmailHighlightCard,
  buildEmailParagraph,
  buildEmailToneCard,
  escapeEmailHtml,
} from "./email-layout.js";
import { signalTypeLabel } from "./vip-subscriber-notify.js";

export function buildVipStatusUpdateEmailContent({ eventType, signal, copy }) {
  const symbol = escapeEmailHtml(String(signal?.coin || "").trim().toUpperCase());
  const label = escapeEmailHtml(signalTypeLabel(signal?.signal_type));
  const updatedAt = new Date().toLocaleString("ar-EG", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });

  return `
${buildEmailHighlightCard({ label: "نوع الصفقة", value: label })}
${buildEmailHighlightCard({ label: "العملة", value: symbol })}
${buildEmailToneCard({
  tone: eventType === "close_now" ? "red" : "green",
  title: "تحديث الحالة",
  body: escapeEmailHtml(copy.message.replace(/\n/g, " ")),
})}
${buildEmailParagraph(`وقت التحديث: ${escapeEmailHtml(updatedAt)}`, { muted: true })}
${buildEmailParagraph("يرجى الالتزام بإدارة المخاطر وعدم المبالغة في حجم الصفقة.", { muted: true })}
  `.trim();
}

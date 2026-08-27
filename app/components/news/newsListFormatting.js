export const SOURCE_LABEL = "HasaN CharT World";

export const NEWS_BREADCRUMBS = [
  { label: "الرئيسية", href: "/" },
  { label: "الأخبار", href: "/news" },
];

export function formatNewsDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Damascus",
  }).format(date);
}

export function cleanNewsText(text) {
  if (!text) return "";

  return String(text)
    .replace(/https?:\/\/t\.me\/[^\s]+/gi, "")
    .replace(/قناة الأخبار الرسمية\s*:*/gi, "")
    .replace(/🔊|📢/g, "")
    .replace(/\b(Reuters|CNBC|Investing\.com|MarketWatch|CoinDesk|Telegram)\b\s*[-–—:]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeExcerpt(text, maxLength = 210) {
  const value = cleanNewsText(text);
  if (!value) return "تفاصيل الخبر غير متاحة حالياً.";
  if (value.length <= maxLength) return value;

  const trimmed = value.slice(0, maxLength).trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  const safeCut = lastSpace > maxLength * 0.65 ? trimmed.slice(0, lastSpace) : trimmed;

  return `${safeCut}…`;
}

export function extractArabicTitle(item) {
  const content = cleanNewsText(item.content || "");
  const title = cleanNewsText(item.title || "");
  const arabicSentences = content
    .split(/[.!؟\n]/)
    .map((part) => part.trim())
    .filter((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18);

  if (arabicSentences.length > 0) {
    return arabicSentences[0].replace(/^عاجل\s*[:：-]?\s*/i, "");
  }

  return title || "خبر اقتصادي عاجل";
}

export { getCanonicalNewsPath as getNewsHref } from "../../../lib/news-urls";

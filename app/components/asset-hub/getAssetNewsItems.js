import { getCachedNewsList } from "../../../lib/server-news-cache";
import { getCanonicalNewsPath } from "../../../lib/news-urls";

function cleanNewsText(text) {
  if (!text) return "";

  return String(text)
    .replace(/https?:\/\/t\.me\/EconomicNewsi/gi, "")
    .replace(/قناة الأخبار الرسمية\s*:*/gi, "")
    .replace(/🔊|📢/g, "")
    .replace(/\b(Reuters|CNBC|Investing\.com|MarketWatch|CoinDesk)\b\s*[-–—:]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getNewsTitle(item) {
  const content = cleanNewsText(item.content || "");
  const title = cleanNewsText(item.title || "");
  const arabicSentences = content
    .split(/[.!؟\n]/)
    .map((part) => part.trim())
    .filter((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18);

  if (arabicSentences.length > 0) {
    return arabicSentences[0].replace(/^عاجل\s*[:：-]?\s*/i, "").slice(0, 95);
  }

  return (title || "خبر اقتصادي").slice(0, 95);
}

function shortText(text, maxLength = 180) {
  const cleaned = cleanNewsText(text);
  if (!cleaned) return "تفاصيل الخبر متاحة عند فتح الصفحة.";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function matchesAssetNews(item, keywords = []) {
  const text = `${item.title || ""} ${item.content || ""} ${item.slug || ""}`.toLowerCase();
  return keywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
}

/**
 * @param {import("./configs/types").AssetHubConfig} config
 * @param {number} [limit]
 */
export async function getAssetNewsItems(config, limit = 8) {
  const keywords = config?.news?.keywords || [];

  if (keywords.length === 0) {
    return [];
  }

  const { items } = await getCachedNewsList({ limit: 50 });

  return (items || [])
    .filter((item) => matchesAssetNews(item, keywords))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      createdAt: item.created_at,
      impactLevel: item.impact_level,
      title: getNewsTitle(item),
      excerpt: shortText(item.title || ""),
      href: getCanonicalNewsPath(item),
    }));
}

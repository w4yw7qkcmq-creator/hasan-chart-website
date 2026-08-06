import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveNewsImageUrl } from "../../../../../lib/news-images";
import { NewsCoverImage } from "../../../../components/news/NewsCoverImage";
import {
  buildNewsCollectionPageJsonLd,
  buildPrivateMetadata,
  buildPublicMetadata,
  serializeJsonLd,
} from "../../../../../lib/seo";
import { REVALIDATE_PUBLIC_NEWS } from "../../../../../lib/public-cache-config";
import { getCachedNewsList } from "../../../../../lib/server-news-cache";
import { NEWS_CATEGORY_LIST_LIMIT } from "../../../../../lib/public-cache-config";
export const revalidate = REVALIDATE_PUBLIC_NEWS;
const CATEGORY_CONFIG = {
  geopolitics: {
    title: "أخبار جيوسياسية",
    description: "آخر الأخبار الجيوسياسية وتأثيرها على الأسواق العالمية.",
    icon: "🌍",
    gradient: "news-category-accent--red",
  },
  economy: {
    title: "الاقتصاد الأمريكي",
    description: "أهم أخبار الفيدرالي والتضخم والوظائف والاقتصاد الأمريكي.",
    icon: "🇺🇸",
    gradient: "news-category-accent--blue",
  },
  stocks: {
    title: "الأسواق العالمية",
    description: "متابعة الأسهم والمؤشرات العالمية ونتائج الشركات.",
    icon: "📊",
    gradient: "news-category-accent--cyan",
  },
  crypto: {
    title: "العملات الرقمية",
    description: "أخبار البيتكوين والعملات الرقمية وأسواق الكريبتو.",
    icon: "₿",
    gradient: "news-category-accent--orange",
  },
  commodities: {
    title: "النفط والطاقة",
    description: "أخبار النفط والذهب والسلع والطاقة العالمية.",
    icon: "🛢️",
    gradient: "news-category-accent--yellow",
  },
};
const CATEGORIES = [
  { key: "all", label: "الكل", href: "/news" },
  {
    key: "geopolitics",
    label: "أخبار جيوسياسية",
    href: "/news/category/geopolitics",
  },
  {
    key: "economy",
    label: "الاقتصاد الأمريكي",
    href: "/news/category/economy",
  },
  { key: "stocks", label: "الأسواق العالمية", href: "/news/category/stocks" },
  { key: "crypto", label: "العملات الرقمية", href: "/news/category/crypto" },
  {
    key: "commodities",
    label: "النفط والطاقة",
    href: "/news/category/commodities",
  },
];
const POPULAR_TAGS = [
  { label: "بيتكوين", href: "/news/tag/bitcoin" },
  { label: "كريبتو", href: "/news/tag/crypto" },
  { label: "الذهب", href: "/news/tag/gold" },
  { label: "النفط", href: "/news/tag/oil" },
  { label: "الفيدرالي", href: "/news/tag/fed" },
  { label: "التضخم", href: "/news/tag/inflation" },
  { label: "فوركس", href: "/news/tag/forex" },
  { label: "الأسهم", href: "/news/tag/stocks" },
];
function cleanNewsText(text) {
  if (!text) return "";
  return String(text)
    .replace(/https?:\/\/t\.me\/EconomicNewsi/gi, "")
    .replace(/قناة الأخبار الرسمية\s*:*/gi, "")
    .replace(/🔊|📢/g, "")
    .replace(
      /\b(Reuters|CNBC|Investing\.com|MarketWatch|CoinDesk)\b\s*[-–—:]?\s*/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}
function shortText(text, maxLength = 260) {
  const cleaned = cleanNewsText(text);
  if (!cleaned) return "تفاصيل الخبر متاحة عند فتح الصفحة.";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trim()}...`;
}
function getCardExcerpt(item) {
  return shortText(item.content || item.title || "", 260);
}
function getNewsImage(item) {
  return resolveNewsImageUrl(item);
}
function extractArabicTitle(item) {
  const content = cleanNewsText(item.content || "");
  const title = cleanNewsText(item.title || "");
  const arabicSentences = content
    .split(/[.!؟\n]/)
    .map((part) => part.trim())
    .filter((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18);
  if (arabicSentences.length > 0) {
    return arabicSentences[0].replace(/^عاجل\s*[:：-]?\s*/i, "").slice(0, 95);
  }
  return (title || "خبر اقتصادي عاجل").slice(0, 95);
}
function getSourceName(url) {
  if (!url) return "مصدر الخبر";
  try {
    const host = new URL(url).hostname.replace("www.", "");
    if (host.includes("investing")) return "Investing";
    if (host.includes("cnbc")) return "CNBC";
    if (host.includes("marketwatch")) return "MarketWatch";
    if (host.includes("coindesk")) return "CoinDesk";
    if (host.includes("t.me")) return "HasaN CharT News";
    return host;
  } catch {
    return "مصدر الخبر";
  }
}
function detectCategory(item) {
  const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
  if (/bitcoin|btc|crypto|ethereum/.test(text)) return "crypto";
  if (/gold|oil|silver|commodit/.test(text)) return "commodities";
  if (/nasdaq|dow|s&p|stock|earnings/.test(text)) return "stocks";
  if (/fed|inflation|cpi|pmi|gdp|jobs/.test(text)) return "economy";
  if (/iran|israel|war|ukraine|russia|gaza/.test(text)) return "geopolitics";
  return "stocks";
}
function getNewsHref(item) {
  return `/news/${item?.slug || item?.id}`;
}
export async function generateMetadata({ params }) {
  const config = CATEGORY_CONFIG[params.category];
  if (!config) {
    return buildPrivateMetadata({
      title: "التصنيف غير موجود - HasaN CharT World",
    });
  }
  return buildPublicMetadata({
    path: `/news/category/${params.category}`,
    title: `${config.title} | HasaN CharT World`,
    description: config.description,
  });
}
export default async function CategoryPage({ params }) {
  const config = CATEGORY_CONFIG[params.category];
  if (!config) {
    notFound();
  }
  const { items: news } = await getCachedNewsList({
    category: params.category,
    limit: NEWS_CATEGORY_LIST_LIMIT,
  });
  const jsonLd = buildNewsCollectionPageJsonLd({
    path: `/news/category/${params.category}`,
    title: `${config.title} | HasaN CharT World`,
    description: config.description,
  });
  return (
    <main className="min-h-screen px-4 py-10 ui-public-seo-subtitle">
      {" "}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />{" "}
      <div className="mx-auto max-w-7xl">
        {" "}
        <section className="mb-8 overflow-hidden rounded-[2rem] border admin-panel-border ui-glass-55 p-8 text-center shadow-[0_20px_80px_rgba(14,165,233,0.12)] backdrop-blur-xl md:p-12">
          {" "}
          <div className="mx-auto mb-4 inline-flex rounded-full border admin-panel-border admin-panel px-5 py-2 text-sm font-black admin-text-muted">
            {" "}
            تصنيف الأخبار{" "}
          </div>{" "}
          <h1 className="mb-4 text-4xl font-black tracking-tight ui-public-seo-subtitle md:text-5xl">
            {" "}
            {config.title}{" "}
          </h1>{" "}
          <p className="mx-auto max-w-2xl text-lg leading-8 ui-public-seo-subtitle">
            {" "}
            {config.description}{" "}
          </p>{" "}
        </section>{" "}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
          {" "}
          {CATEGORIES.map((category) => {
            const isActive = category.key === params.category;
            const isAll = category.key === "all";
            return (
              <Link
                key={category.key}
                href={category.href}
                className={`rounded-2xl border px-5 py-3 text-sm font-black no-underline transition-all ${isActive || (isAll && !params.category) ? "admin-panel-border admin-panel !ui-public-seo-title shadow-lg shadow-cyan-500/25" : "admin-panel-border ui-glass-solid/65 ui-public-seo-subtitle hover:admin-panel-border hover:admin-panel hover:!ui-public-seo-title hover:shadow-lg hover:shadow-cyan-500/25"}`}
              >
                {" "}
                {category.label}{" "}
              </Link>
            );
          })}{" "}
        </div>{" "}
        <div className="mb-8 rounded-[1.75rem] border admin-panel-border ui-glass-solid/75 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          {" "}
          <div className="mb-4 text-center text-lg font-black ui-public-seo-subtitle">
            {" "}
            الوسوم الشائعة{" "}
          </div>{" "}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {" "}
            {POPULAR_TAGS.map((tag) => (
              <Link
                key={tag.href}
                href={tag.href}
                className="rounded-full admin-panel px-4 py-2 text-sm font-black !ui-public-seo-title no-underline shadow-lg transition hover:scale-105 hover:admin-panel"
              >
                {" "}
                #{tag.label}{" "}
              </Link>
            ))}{" "}
          </div>{" "}
        </div>{" "}
        {news.length === 0 ? (
          <div className="rounded-3xl border admin-panel-border ui-glass-solid/70 p-10 text-center ui-public-seo-subtitle shadow-xl backdrop-blur-xl">
            {" "}
            لا توجد أخبار متاحة حالياً ضمن هذا التصنيف.{" "}
          </div>
        ) : (
          <div className="grid auto-rows-fr gap-6 md:grid-cols-2 xl:grid-cols-3">
            {" "}
            {news.map((item, index) => {
              const newsImpact = item.impact_level || "MEDIUM";
              const isHighImpact = newsImpact === "HIGH";
              const impactColor = isHighImpact
                ? "ui-news-impact-badge--high"
                : "ui-news-impact-badge--medium";
              const sourceLink = item.source_link || null;
              const newsTitle = extractArabicTitle(item);
              const newsContent = shortText(item.content || item.title, 260);
              const newsImage = getNewsImage(item);
              const sourceName = getSourceName(sourceLink);
              return (
                <Link
                  key={item.id}
                  href={getNewsHref(item)}
                  className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border admin-panel-border ui-glass-solid/85 ui-public-seo-subtitle no-underline shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:admin-panel-border hover:shadow-[0_24px_90px_rgba(14,165,233,0.20)]"
                >
                  {" "}
                  <div
                    className={`relative h-56 overflow-hidden admin-panel ${config.gradient}`}
                  >
                    {" "}
                    <NewsCoverImage
                      src={newsImage}
                      alt={newsTitle || "صورة الخبر"}
                      title={newsTitle}
                      category={params.category}
                      item={item}
                      priority={index === 0}
                    />{" "}
                    <div className="absolute inset-0 z-20 admin-panel" />{" "}
                    <div className="absolute left-4 top-4 z-30 rounded-full ui-glass-solid/90 px-3 py-1 text-xs font-black ui-public-seo-subtitle backdrop-blur">
                      {" "}
                      {sourceName}{" "}
                    </div>{" "}
                    <div
                      className={`absolute right-4 top-4 z-30 rounded-full border px-3 py-1 text-xs font-black backdrop-blur ${impactColor}`}
                    >
                      {" "}
                      {isHighImpact ? "🔴 عاجل" : "🟡 مهم"}{" "}
                    </div>{" "}
                  </div>{" "}
                  <div className="flex flex-1 flex-col p-6">
                    {" "}
                    <div className="mb-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold ui-public-seo-subtitle">
                      {" "}
                      {new Date(item.created_at).toLocaleString("ar-SA", {
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric",
                      })}{" "}
                    </div>{" "}
                    <h2 className="mb-4 line-clamp-3 min-h-[5.25rem] text-xl font-black leading-relaxed ui-public-seo-subtitle">
                      {" "}
                      {newsTitle}{" "}
                    </h2>{" "}
                    <p className="line-clamp-4 text-[15px] leading-7 ui-public-seo-subtitle">
                      {" "}
                      {newsContent}{" "}
                    </p>{" "}
                    <div className="mt-auto border-t border-[var(--ui-border)]200 pt-5 text-center">
                      {" "}
                      <span className="text-xs font-bold ui-public-seo-subtitle">
                        {" "}
                        تحديث مباشر • HasaN CharT News{" "}
                      </span>{" "}
                    </div>{" "}
                  </div>{" "}
                </Link>
              );
            })}{" "}
          </div>
        )}{" "}
      </div>{" "}
    </main>
  );
}

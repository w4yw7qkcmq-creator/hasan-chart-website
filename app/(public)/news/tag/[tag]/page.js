import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildNewsCollectionPageJsonLd,
  buildPrivateMetadata,
  buildPublicMetadata,
  serializeJsonLd,
} from "../../../../../lib/seo";
import { REVALIDATE_PUBLIC_NEWS } from "../../../../../lib/public-cache-config";
import { getCachedNewsList } from "../../../../../lib/server-news-cache";
import { NEWS_TAG_LIST_LIMIT } from "../../../../../lib/public-cache-config";
export const revalidate = REVALIDATE_PUBLIC_NEWS;
const TAG_CONFIG = {
  bitcoin: {
    title: "أخبار البيتكوين",
    description: "آخر أخبار البيتكوين وتحركات سوق العملات الرقمية.",
    keywords: ["bitcoin", "btc", "بيتكوين"],
  },
  crypto: {
    title: "أخبار العملات الرقمية",
    description: "أخبار الكريبتو والبيتكوين والإيثريوم وأسواق البلوكتشين.",
    keywords: [
      "crypto",
      "bitcoin",
      "btc",
      "ethereum",
      "blockchain",
      "كريبتو",
      "عملات رقمية",
    ],
  },
  gold: {
    title: "أخبار الذهب",
    description:
      "آخر أخبار الذهب وتأثير الدولار والفائدة والتضخم على المعدن الأصفر.",
    keywords: ["gold", "xau", "ذهب"],
  },
  oil: {
    title: "أخبار النفط",
    description:
      "متابعة أخبار النفط والطاقة وأوبك ومضيق هرمز وتأثيرها على الأسواق.",
    keywords: [
      "oil",
      "brent",
      "crude",
      "opec",
      "hormuz",
      "نفط",
      "أوبك",
      "هرمز",
    ],
  },
  fed: {
    title: "أخبار الفيدرالي الأمريكي",
    description:
      "أخبار قرارات الفائدة وتصريحات الفيدرالي وتأثيرها على الدولار والذهب والأسهم.",
    keywords: [
      "fed",
      "federal reserve",
      "powell",
      "rate",
      "interest",
      "فيدرالي",
      "الفائدة",
      "باول",
    ],
  },
  inflation: {
    title: "أخبار التضخم",
    description: "بيانات التضخم ومؤشرات CPI وPCE وتأثيرها على الأسواق.",
    keywords: ["inflation", "cpi", "pce", "تضخم"],
  },
  forex: {
    title: "أخبار الفوركس",
    description:
      "آخر أخبار العملات الأجنبية والدولار واليورو وتحركات سوق الفوركس.",
    keywords: [
      "forex",
      "usd",
      "eur",
      "gbp",
      "jpy",
      "dollar",
      "فوركس",
      "الدولار",
      "اليورو",
    ],
  },
  stocks: {
    title: "أخبار الأسهم",
    description: "أخبار الأسهم والمؤشرات الأمريكية والعالمية ونتائج الشركات.",
    keywords: [
      "stocks",
      "nasdaq",
      "dow",
      "s&p",
      "earnings",
      "أسهم",
      "ناسداك",
      "داو",
    ],
  },
};
function getTagConfig(tag) {
  return (
    TAG_CONFIG[tag] || {
      title: `أخبار ${tag}`,
      description: `آخر الأخبار المرتبطة بكلمة ${tag}.`,
      keywords: [tag],
    }
  );
}
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
function shortText(text, maxLength = 240) {
  const cleaned = cleanNewsText(text);
  if (!cleaned) return "تفاصيل الخبر متاحة عند فتح الصفحة.";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trim()}...`;
}
function getNewsHref(item) {
  return `/news/${item?.slug || item?.id}`;
}
function matchesTag(item, config) {
  const text =
    `${item.title || ""} ${item.content || ""} ${item.slug || ""}`.toLowerCase();
  return config.keywords.some((keyword) =>
    text.includes(String(keyword).toLowerCase()),
  );
}
export async function generateMetadata({ params }) {
  const config = getTagConfig(params.tag);
  const isKnownTag = Boolean(TAG_CONFIG[params.tag]);
  return buildPublicMetadata({
    path: `/news/tag/${params.tag}`,
    title: `${config.title} | HasaN CharT World`,
    description: config.description,
    index: isKnownTag,
    follow: isKnownTag,
  });
}
export default async function TagPage({ params }) {
  const config = getTagConfig(params.tag);
  if (!TAG_CONFIG[params.tag]) {
    notFound();
  }
  const { items: news } = await getCachedNewsList({
    tag: params.tag,
    limit: NEWS_TAG_LIST_LIMIT,
  });
  const jsonLd = buildNewsCollectionPageJsonLd({
    path: `/news/tag/${params.tag}`,
    title: `${config.title} | HasaN CharT World`,
    description: config.description,
  });
  return (
    <main className="min-h-screen px-4 py-10 ui-public-seo-subtitle" dir="rtl">
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
            أرشيف الوسم{" "}
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
          {Object.entries(TAG_CONFIG).map(([key, value]) => (
            <Link
              key={key}
              href={`/news/tag/${key}`}
              className={`rounded-2xl border px-5 py-3 text-sm font-black no-underline transition-all ${key === params.tag ? "admin-panel-border admin-panel !ui-public-seo-title shadow-lg shadow-cyan-500/25" : "admin-panel-border ui-glass-solid/65 ui-public-seo-subtitle hover:admin-panel-border hover:admin-panel hover:!ui-public-seo-title hover:shadow-lg hover:shadow-cyan-500/25"}`}
            >
              {" "}
              {value.title.replace("أخبار ", "")}{" "}
            </Link>
          ))}{" "}
        </div>{" "}
        {news.length === 0 ? (
          <div className="rounded-3xl border admin-panel-border ui-glass-solid/70 p-10 text-center ui-public-seo-subtitle shadow-xl backdrop-blur-xl">
            {" "}
            لا توجد أخبار متاحة حالياً ضمن هذا الوسم.{" "}
          </div>
        ) : (
          <div className="grid auto-rows-fr gap-6 md:grid-cols-2 xl:grid-cols-3">
            {" "}
            {news.map((item) => {
              const isHighImpact = item.impact_level === "HIGH";
              return (
                <Link
                  key={item.id}
                  href={getNewsHref(item)}
                  className="group flex h-full flex-col rounded-[1.75rem] border admin-panel-border ui-glass-solid/85 p-6 ui-public-seo-subtitle no-underline shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:admin-panel-border hover:shadow-[0_24px_90px_rgba(14,165,233,0.20)]"
                >
                  {" "}
                  <div className="mb-4 flex items-center justify-between gap-3">
                    {" "}
                    <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold ui-public-seo-subtitle">
                      {" "}
                      {new Date(item.created_at).toLocaleString("ar-SA", {
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric",
                      })}{" "}
                    </div>{" "}
                    <div
                      className={`rounded-full border px-3 py-1 text-xs font-black ${isHighImpact ? "ui-news-impact-badge--high" : "ui-news-impact-badge--medium"}`}
                    >
                      {" "}
                      {isHighImpact ? "🔴 عاجل" : "🟡 مهم"}{" "}
                    </div>{" "}
                  </div>{" "}
                  <h2 className="mb-4 line-clamp-3 min-h-[5.25rem] text-xl font-black leading-relaxed ui-public-seo-subtitle">
                    {" "}
                    {getNewsTitle(item)}{" "}
                  </h2>{" "}
                  <p className="line-clamp-4 text-[15px] leading-7 ui-public-seo-subtitle">
                    {" "}
                    {shortText(item.content || item.title)}{" "}
                  </p>{" "}
                  <div className="mt-auto border-t border-[var(--ui-border)]200 pt-5 text-center">
                    {" "}
                    <span className="text-xs font-bold ui-public-seo-subtitle">
                      {" "}
                      HasaN CharT News • تحديث مباشر{" "}
                    </span>{" "}
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

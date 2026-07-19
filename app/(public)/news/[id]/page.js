import { notFound } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { cache } from "react";
import { NewsArticleCoverImage } from "../../../components/news/NewsCoverImage";
import NewsServiceLinks from "../../../components/news/NewsServiceLinks";
import NewsRelatedAssets from "../../../components/news/NewsRelatedAssets";
import NewsQuickSummary from "../../../components/news/NewsQuickSummary";
import NewsWatchPoints from "../../../components/news/NewsWatchPoints";
import NewsArticleCtas from "../../../components/news/NewsArticleCtas";
import {
  getAffectedMarketLabel,
  getImpactLevelLabel,
  getNewsArticleCtas,
  getNewsTopicType,
  getNewsUpdatedAt,
  getNewsWatchPoints,
  formatNewsDateTime,
  toNewsIsoDateTime,
} from "../../../components/news/newsDetailHelpers";
import {
  getRelatedAssetsFromNews,
} from "../../../components/asset-hub/getRelatedAssetsFromNews";
import Breadcrumbs from "../../../components/seo/Breadcrumbs";
import LinkifiedText from "../../../components/seo/LinkifiedText";
import {
  detectNewsCategory,
  getNewsCategoryVisual,
  isBlockedNewsImageUrl,
  resolveNewsImageUrl,
} from "../../../../lib/news-images";
import {
  buildArticleMetadata,
  buildBreadcrumbJsonLd,
  buildNewsArticleJsonLd,
  buildPrivateMetadata,
  serializeJsonLd,
  SITE_URL,
} from "../../../../lib/seo";
import { getNewsTopicServiceLinks } from "../../../../lib/internal-links";
import { REVALIDATE_PUBLIC_NEWS } from "../../../../lib/public-cache-config";
import {
  getCachedNewsPost,
  getCachedNewsRelatedPool,
} from "../../../../lib/server-news-cache";

const CopyArticleButton = dynamic(() => import("../../../components/CopyArticleButton"), {
  ssr: false,
  loading: () => null,
});

export const revalidate = REVALIDATE_PUBLIC_NEWS;

const getNewsArticleForRequest = cache(async (identifier) => {
  return getCachedNewsPost(identifier);
});

const getReachableNewsImage = cache(async (rawImage) => {
  if (!rawImage || isBlockedNewsImageUrl(rawImage)) {
    return null;
  }

  return (await isImageReachable(rawImage)) ? rawImage : null;
});

function cleanText(text) {
  if (!text) return "";

  return String(text)
    .replace(/https?:\/\/t\.me\/EconomicNewsi/gi, "")
    .replace(/قناة الأخبار الرسمية\s*:*/gi, "")
    .replace(/🔊|📢/g, "")
    .replace(/\b(Reuters|CNBC|Investing\.com|MarketWatch|CoinDesk)\b\s*[-–—:]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getNewsTitle(news) {
  const content = cleanText(news?.content || "");
  const title = cleanText(news?.title || "");
  const arabicSentences = content
    .split(/[.!؟\n]/)
    .map((part) => part.trim())
    .filter((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18);

  if (arabicSentences.length > 0) {
    return arabicSentences[0].replace(/^عاجل\s*[:：-]?\s*/i, "").slice(0, 150);
  }

  return title || "خبر اقتصادي عاجل";
}

function getNewsImage(news) {
  return resolveNewsImageUrl(news);
}

async function isImageReachable(url) {
  if (!url || isBlockedNewsImageUrl(url)) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    return response.ok && contentType.toLowerCase().startsWith("image/");
  } catch {
    return false;
  }
}

function detectCategory(news) {
  return detectNewsCategory(news);
}

function getCategoryLabel(category) {
  const labels = {
    crypto: "العملات الرقمية",
    commodities: "النفط والطاقة",
    stocks: "الأسواق العالمية",
    economy: "الاقتصاد الأمريكي",
    geopolitics: "أخبار جيوسياسية",
  };

  return labels[category] || "الأخبار";
}


function getCategoryVisual(category) {
  return getNewsCategoryVisual(category);
}


function getNewsHref(news) {
  return `/news/${news?.slug || news?.id}`;
}

function detectTags(news = {}) {
  const text = `${news.title || ""} ${news.content || ""} ${news.slug || ""}`.toLowerCase();
  const tags = [];

  if (/(bitcoin|btc|بيتكوين)/i.test(text)) tags.push({ label: "بيتكوين", href: "/news/tag/bitcoin" });
  if (/(crypto|ethereum|blockchain|كريبتو|عملات رقمية)/i.test(text)) tags.push({ label: "كريبتو", href: "/news/tag/crypto" });
  if (/(gold|xau|ذهب)/i.test(text)) tags.push({ label: "الذهب", href: "/news/tag/gold" });
  if (/(oil|brent|crude|opec|hormuz|نفط|أوبك|هرمز)/i.test(text)) tags.push({ label: "النفط", href: "/news/tag/oil" });
  if (/(fed|powell|federal reserve|rate|interest|فيدرالي|الفائدة|باول)/i.test(text)) tags.push({ label: "الفيدرالي", href: "/news/tag/fed" });
  if (/(inflation|cpi|pce|تضخم)/i.test(text)) tags.push({ label: "التضخم", href: "/news/tag/inflation" });
  if (/(forex|usd|eur|gbp|jpy|dollar|فوركس|الدولار|اليورو)/i.test(text)) tags.push({ label: "فوركس", href: "/news/tag/forex" });
  if (/(stocks|nasdaq|dow|s&p|earnings|أسهم|ناسداك|داو)/i.test(text)) tags.push({ label: "الأسهم", href: "/news/tag/stocks" });

  return tags.slice(0, 5);
}

function getRelatedNews(currentNews, pool) {
  const currentCategory = detectCategory(currentNews);

  const categoryMatches = (pool || [])
    .filter((item) => item.id !== currentNews.id && detectCategory(item) === currentCategory)
    .slice(0, 6);

  if (categoryMatches.length > 0) {
    return categoryMatches;
  }

  return (pool || []).filter((item) => item.id !== currentNews.id).slice(0, 6);
}

function getAdjacentNewsFromPool(currentNews, pool) {
  const sorted = pool || [];
  const index = sorted.findIndex((item) => item.id === currentNews.id);

  if (index < 0) {
    return { previous: null, next: null };
  }

  return {
    previous: sorted[index + 1] || null,
    next: sorted[index - 1] || null,
  };
}

export async function generateMetadata({ params }) {
  const news = await getNewsArticleForRequest(params.id);

  if (!news) {
    return buildPrivateMetadata({ title: "خبر غير موجود - HasaN CharT World" });
  }

  const title = getNewsTitle(news);
  const description = cleanText(news.content || title).slice(0, 160);
  const rawImage = getNewsImage(news);
  const reachableImage = await getReachableNewsImage(rawImage);
  const image = reachableImage || undefined;
  const updatedAtRaw = getNewsUpdatedAt(news);

  return buildArticleMetadata({
    path: getNewsHref(news),
    title,
    description,
    keywords: [
      title,
      "أخبار اقتصادية",
      "أخبار الفوركس",
      "أخبار العملات الرقمية",
      "أخبار الأسهم",
      "أخبار الذهب",
      "أخبار النفط",
      "HasaN CharT World",
    ],
    image,
    publishedTime: news.created_at,
    modifiedTime: updatedAtRaw || news.created_at,
  });
}

export default async function NewsDetailsPage({ params }) {
  const [news, newsPool] = await Promise.all([
    getNewsArticleForRequest(params.id),
    getCachedNewsRelatedPool(),
  ]);
  const relatedNews = news ? getRelatedNews(news, newsPool) : [];
  const adjacentNews = news ? getAdjacentNewsFromPool(news, newsPool) : { previous: null, next: null };

  if (!news) {
    notFound();
  }

  const title = getNewsTitle(news);
  const content = cleanText(news.content || title);
  const rawImage = getNewsImage(news);
  const image = await getReachableNewsImage(rawImage);
  const publishedDate = formatNewsDateTime(news.created_at);
  const publishedAtIso = toNewsIsoDateTime(news.created_at);
  const updatedAtRaw = getNewsUpdatedAt(news);
  const updatedDate = formatNewsDateTime(updatedAtRaw);
  const updatedAtIso = toNewsIsoDateTime(updatedAtRaw);
  const showUpdatedAt =
    Boolean(updatedAtRaw) &&
    new Date(updatedAtRaw).getTime() !== new Date(news.created_at).getTime();
  const isHighImpact = news.impact_level === "HIGH";
  const articleUrl = `${SITE_URL}${getNewsHref(news)}`;
  const category = detectCategory(news);
  const categoryLabel = getCategoryLabel(category);
  const categoryVisual = getCategoryVisual(category);
  const newsTags = detectTags(news);
  const topicServiceLinks = getNewsTopicServiceLinks(news);
  const relatedAssets = getRelatedAssetsFromNews(news);
  const newsTopicType = getNewsTopicType(news, category);
  const affectedMarketLabel = getAffectedMarketLabel(relatedAssets, category);
  const impactLabel = getImpactLevelLabel(news.impact_level);
  const watchPoints = getNewsWatchPoints(news);
  const articleCtas = getNewsArticleCtas(relatedAssets.length > 0);
  const newsBreadcrumbs = [
    { label: "الرئيسية", href: "/" },
    { label: "الأخبار", href: "/news" },
    { label: categoryLabel, href: `/news/category/${category}` },
    { label: title, href: getNewsHref(news) },
  ];

  const dateModified = updatedAtRaw || news.created_at;

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(newsBreadcrumbs, getNewsHref(news));

  const jsonLd = buildNewsArticleJsonLd({
    path: getNewsHref(news),
    title,
    description: content,
    content,
    image: image || undefined,
    datePublished: news.created_at,
    dateModified,
    articleSection: categoryLabel,
    topicLabel: newsTopicType.label,
    mentions: relatedAssets,
  });

  return (
    <main className="min-h-screen px-4 py-10 text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />

      <div className="mx-auto mb-4 max-w-4xl rounded-2xl border border-white/60 bg-white/80 px-5 py-4 shadow-sm backdrop-blur" dir="rtl">
        <Breadcrumbs items={newsBreadcrumbs} variant="light" />
      </div>

      <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3" dir="rtl">
        <Link
          href="/news"
          className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-600 px-5 py-3 text-sm font-black !text-white dark:!text-white no-underline shadow-xl shadow-emerald-600/20 transition hover:scale-105 hover:bg-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-400"
        >
          ← العودة لصفحة الأخبار الرئيسية
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <CopyArticleButton url={articleUrl} />
          <a
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(title)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-2xl border border-violet-500/40 bg-violet-600 px-4 py-3 text-sm font-black !text-white dark:!text-white no-underline shadow-xl shadow-violet-600/20 transition hover:scale-105 hover:bg-violet-700 dark:border-violet-300/40 dark:bg-violet-400"
          >
            مشاركة X
          </a>
        </div>
      </div>

      <article className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/50 bg-white/85 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        <div className={`relative h-[320px] overflow-hidden bg-gradient-to-br ${categoryVisual.gradient} text-center md:h-[460px]`}>
          <NewsArticleCoverImage
            src={image}
            alt={title}
            title={title}
            category={category}
            item={news}
          />

          <div className="absolute inset-0 z-20 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent" />
          <div className="absolute right-6 top-6 z-30 rounded-full border border-white/40 bg-white/90 px-4 py-2 text-sm font-black text-slate-800 backdrop-blur">
            {isHighImpact ? "🔴 عاجل" : "🟡 مهم"}
          </div>
        </div>

        <div className="p-7 md:p-10" dir="rtl">
          <NewsQuickSummary
            newsType={newsTopicType.label}
            affectedMarket={affectedMarketLabel}
            impactLabel={impactLabel}
            publishedAt={publishedDate || "—"}
            publishedAtIso={publishedAtIso}
            updatedAt={updatedDate}
            updatedAtIso={updatedAtIso}
            showUpdatedAt={showUpdatedAt}
          />

          {newsTags.length > 0 ? (
            <div className="mb-5 flex flex-wrap items-center gap-3">
              {newsTags.map((tag) => (
                <Link
                  key={tag.href}
                  href={tag.href}
                  className="rounded-full border border-cyan-300/50 bg-cyan-500 px-4 py-2 text-sm font-black !text-white no-underline shadow-lg shadow-cyan-500/20 transition hover:scale-105 hover:bg-cyan-600"
                >
                  #{tag.label}
                </Link>
              ))}
            </div>
          ) : null}

          <h1 className="mb-7 text-2xl font-black leading-relaxed text-slate-950 md:text-4xl">
            {title}
          </h1>

          <div className="prose max-w-none text-[16px] leading-8 text-slate-700 prose-p:leading-8">
            {content
              .split(/(?<=[.!؟])\s+/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>
                  <LinkifiedText text={paragraph} variant="light" maxLinks={2} />
                </p>
              ))}
          </div>

          <NewsArticleCtas ctas={articleCtas} />
          <NewsRelatedAssets assets={relatedAssets} />
          <NewsWatchPoints points={watchPoints} />
          <NewsServiceLinks links={topicServiceLinks} />

          <div className="mt-10 border-t border-slate-200 pt-6 text-center">
            <div className="mb-5 text-sm font-bold text-slate-400">
              تحديث مباشر • HasaN CharT News
            </div>
            <Link
              href="/news"
              className="inline-flex rounded-2xl border border-emerald-500/40 bg-emerald-600 px-6 py-3 text-sm font-black !text-white dark:!text-white no-underline shadow-xl shadow-emerald-600/20 transition hover:scale-105 hover:bg-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-400"
            >
              العودة لصفحة الأخبار الرئيسية
            </Link>
          </div>
        </div>
      </article>

      {(adjacentNews.previous || adjacentNews.next) ? (
        <section className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2" dir="rtl">
          {adjacentNews.previous ? (
            <Link
              href={getNewsHref(adjacentNews.previous)}
              className="rounded-[1.5rem] border border-white/50 bg-white/75 p-5 no-underline shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl"
            >
              <div className="mb-3 text-sm font-black text-cyan-600">الخبر السابق</div>
              <h3 className="line-clamp-2 text-lg font-black leading-relaxed text-slate-950">
                {getNewsTitle(adjacentNews.previous)}
              </h3>
            </Link>
          ) : (
            <div />
          )}

          {adjacentNews.next ? (
            <Link
              href={getNewsHref(adjacentNews.next)}
              className="rounded-[1.5rem] border border-white/50 bg-white/75 p-5 no-underline shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl"
            >
              <div className="mb-3 text-sm font-black text-cyan-600">الخبر التالي</div>
              <h3 className="line-clamp-2 text-lg font-black leading-relaxed text-slate-950">
                {getNewsTitle(adjacentNews.next)}
              </h3>
            </Link>
          ) : (
            <div />
          )}
        </section>
      ) : null}

      {relatedNews.length > 0 && news ? (
        <section className="mx-auto mt-10 max-w-4xl rounded-[2rem] border border-white/50 bg-white/75 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl" dir="rtl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 text-sm font-black text-cyan-600">{categoryLabel}</div>
              <h2 className="text-2xl font-black text-slate-950">اقرأ أيضاً</h2>
            </div>
            <Link
              href={`/news/category/${category}`}
              className="rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black !text-white no-underline shadow-lg transition hover:bg-cyan-700"
            >
              عرض كل أخبار التصنيف
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {relatedNews.map((item) => (
              <Link
                key={item.id}
                href={getNewsHref(item)}
                className="group rounded-3xl border border-slate-200 bg-white/85 p-5 no-underline shadow-sm transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl"
              >
                <div className="mb-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                  {new Date(item.created_at).toLocaleString("ar-SA", {
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                  })}
                </div>
                <h3 className="mb-3 line-clamp-2 text-lg font-black leading-relaxed text-slate-950 transition group-hover:text-cyan-700">
                  {getNewsTitle(item)}
                </h3>
                <p className="line-clamp-2 text-sm leading-7 text-slate-600">
                  {cleanText(item.content || item.title || "").slice(0, 160)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
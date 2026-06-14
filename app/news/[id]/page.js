import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const SITE_URL = "https://www.hasanchartworld.com";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

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
  const title = cleanText(news?.title || news?.normalized_title || "");
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
  const imageUrl =
    news?.image_url ||
    news?.image ||
    news?.thumbnail_url ||
    news?.thumbnail ||
    news?.urlToImage ||
    news?.url_to_image ||
    null;

  if (!imageUrl) return null;

  const value = String(imageUrl).trim();
  if (!value) return null;
  if (value.startsWith("/app/assets/")) return null;
  if (/default|placeholder|sprite|logo|avatar|blank|pixel|1x1/i.test(value)) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  return null;
}

function detectCategory(news) {
  const text = `${news?.title || ""} ${news?.content || ""} ${news?.topic_cluster || ""}`.toLowerCase();

  if (/bitcoin|btc|crypto|ethereum/.test(text)) return "crypto";
  if (/gold|oil|silver|commodit/.test(text)) return "commodities";
  if (/nasdaq|dow|s&p|stock|earnings/.test(text)) return "stocks";
  if (/fed|inflation|cpi|pmi|gdp|jobs/.test(text)) return "economy";
  if (/iran|israel|war|ukraine|russia|gaza/.test(text)) return "geopolitics";

  return "stocks";
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

async function getNewsPost(id) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("news_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

async function getRelatedNews(currentNews) {
  const supabase = getSupabaseClient();
  const currentCategory = detectCategory(currentNews);

  const { data, error } = await supabase
    .from("news_posts")
    .select("id,title,content,created_at,impact_level")
    .neq("id", currentNews.id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("Related news fetch error:", error.message);
    return [];
  }

  const categoryMatches = (data || [])
    .filter((item) => detectCategory(item) === currentCategory)
    .slice(0, 6);

  if (categoryMatches.length > 0) {
    return categoryMatches;
  }

  return (data || []).slice(0, 6);
}

export async function generateMetadata({ params }) {
  const news = await getNewsPost(params.id);

  if (!news) {
    return {
      title: "خبر غير موجود - HasaN CharT World",
      robots: { index: false, follow: false },
    };
  }

  const title = getNewsTitle(news);
  const description = cleanText(news.content || news.summary || news.description || title).slice(0, 160);
  const image = getNewsImage(news) || `${SITE_URL}/favicon.png`;
  const url = `${SITE_URL}/news/${news.id}`;

  const keywords = [
    title,
    "أخبار اقتصادية",
    "أخبار الفوركس",
    "أخبار العملات الرقمية",
    "أخبار الأسهم",
    "أخبار الذهب",
    "أخبار النفط",
    "HasaN CharT World",
  ].join(", ");

  return {
    title: `${title} - HasaN CharT World`,
    description,
    keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "HasaN CharT World",
      type: "article",
      section: "Economic News",
      tags: [title, "اقتصاد", "أسواق مالية", "فوركس", "كريبتو"],
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      publishedTime: news.created_at,
      locale: "ar_AR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function NewsDetailsPage({ params }) {
  const news = await getNewsPost(params.id);
  const relatedNews = news ? await getRelatedNews(news) : [];

  if (!news) {
    notFound();
  }

  const title = getNewsTitle(news);
  const content = cleanText(news.content || news.summary || news.description || title);
  const image = getNewsImage(news);
  const publishedDate = new Date(news.created_at).toLocaleString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const isHighImpact = news.impact_level === "HIGH";
  const articleUrl = `${SITE_URL}/news/${news.id}`;
  const category = detectCategory(news);
  const categoryLabel = getCategoryLabel(category);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "الرئيسية",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "الأخبار",
        item: `${SITE_URL}/news`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: categoryLabel,
        item: `${SITE_URL}/news/category/${category}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: title,
        item: articleUrl,
      },
    ],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    keywords: [
      title,
      "أخبار اقتصادية",
      "فوركس",
      "عملات رقمية",
      "أسواق عالمية",
    ],
    articleSection: categoryLabel,
    headline: title,
    description: content.slice(0, 180),
    image: image ? [image] : [`${SITE_URL}/favicon.png`],
    datePublished: news.created_at,
    dateModified: news.created_at,
    mainEntityOfPage: articleUrl,
    author: {
      "@type": "Organization",
      name: "HasaN CharT News",
    },
    publisher: {
      "@type": "Organization",
      name: "HasaN CharT World",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/favicon.png`,
      },
    },
  };

  return (
    <main className="min-h-screen px-4 py-10 text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("click", async function (event) {
              const button = event.target.closest("[data-copy-article-url]");
              if (!button) return;

              const url = button.getAttribute("data-copy-article-url");
              if (!url) return;

              try {
                await navigator.clipboard.writeText(url);
                const originalText = button.textContent;
                button.textContent = "تم نسخ الرابط ✅";
                setTimeout(function () {
                  button.textContent = originalText;
                }, 1800);
              } catch (error) {
                window.prompt("انسخ رابط الخبر:", url);
              }
            });
          `,
        }}
      />

      <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3" dir="rtl">
        <Link
          href="/news"
          className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-600 px-5 py-3 text-sm font-black !text-white dark:!text-white no-underline shadow-xl shadow-emerald-600/20 transition hover:scale-105 hover:bg-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-400"
        >
          ← العودة لصفحة الأخبار الرئيسية
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-copy-article-url={articleUrl}
            className="inline-flex appearance-none items-center rounded-2xl border border-sky-500/40 bg-sky-600 px-4 py-3 text-sm font-black !text-white dark:!text-white shadow-xl shadow-sky-600/20 transition hover:scale-105 hover:bg-sky-700 dark:border-sky-300/40 dark:bg-sky-400"
          >
            نسخ الرابط
          </button>
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
        <div className="relative h-[320px] overflow-hidden bg-gradient-to-br from-cyan-950 via-sky-950 to-slate-950 text-center md:h-[460px]">
          <div className={`absolute inset-0 ${image ? "hidden" : "flex"} items-center justify-center fallback-article-image`}>
            <div>
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-cyan-300/25 bg-cyan-400/15 text-5xl shadow-[0_0_48px_rgba(34,211,238,0.22)]">
                📰
              </div>
              <div className="text-2xl font-black text-cyan-50">HasaN CharT News</div>
              <div className="mt-2 text-sm font-bold text-cyan-100/75">تغطية اقتصادية مباشرة</div>
            </div>
          </div>

          {image ? (
            <img
              src={image}
              alt={title}
              className="relative z-10 h-full w-full object-cover"
            />
          ) : null}

          <div className="absolute inset-0 z-20 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent" />
          <div className="absolute right-6 top-6 z-30 rounded-full border border-white/40 bg-white/90 px-4 py-2 text-sm font-black text-slate-800 backdrop-blur">
            {isHighImpact ? "🔴 عاجل" : "🟡 مهم"}
          </div>
        </div>

        <div className="p-7 md:p-10" dir="rtl">
          <div className="mb-5 inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-500">
            {publishedDate}
          </div>

          <h1 className="mb-7 text-2xl font-black leading-relaxed text-slate-950 md:text-4xl">
            {title}
          </h1>

          <div className="prose max-w-none text-[16px] leading-8 text-slate-700 prose-p:leading-8">
            {content
              .split(/(?<=[.!؟])\s+/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>

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

      {relatedNews.length > 0 && news ? (
        <section className="mx-auto mt-10 max-w-4xl rounded-[2rem] border border-white/50 bg-white/75 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl" dir="rtl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 text-sm font-black text-cyan-600">{categoryLabel}</div>
              <h2 className="text-2xl font-black text-slate-950">أخبار ذات صلة قد تهمك</h2>
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
                href={`/news/${item.id}`}
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
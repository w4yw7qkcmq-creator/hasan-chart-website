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

async function isImageReachable(url) {
  if (!url) return false;

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


function getCategoryVisual(category) {
  const visuals = {
    crypto: {
      icon: "₿",
      label: "العملات الرقمية",
      subtitle: "بيتكوين • كريبتو • بلوكتشين",
      gradient: "from-orange-900 via-orange-950 to-slate-950",
    },
    commodities: {
      icon: "🛢️",
      label: "النفط والطاقة",
      subtitle: "نفط • ذهب • سلع",
      gradient: "from-yellow-900 via-amber-950 to-slate-950",
    },
    stocks: {
      icon: "📊",
      label: "تحديثات الأسواق",
      subtitle: "تحركات مؤثرة على التداول",
      gradient: "from-cyan-950 via-sky-950 to-slate-950",
    },
    economy: {
      icon: "🇺🇸",
      label: "الاقتصاد الأمريكي",
      subtitle: "فائدة • تضخم • وظائف",
      gradient: "from-blue-950 via-indigo-950 to-slate-950",
    },
    geopolitics: {
      icon: "🌍",
      label: "أخبار جيوسياسية",
      subtitle: "توترات • حروب • تأثيرات السوق",
      gradient: "from-red-950 via-red-900 to-slate-950",
    },
  };

  return visuals[category] || visuals.stocks;
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

async function getNewsPost(identifier) {
  const supabase = getSupabaseClient();

  const { data: slugData, error: slugError } = await supabase
    .from("news_posts")
    .select("*")
    .eq("slug", identifier)
    .maybeSingle();

  if (!slugError && slugData) return slugData;

  const { data: idData, error: idError } = await supabase
    .from("news_posts")
    .select("*")
    .eq("id", identifier)
    .maybeSingle();

  if (idError || !idData) return null;
  return idData;
}

async function getRelatedNews(currentNews) {
  const supabase = getSupabaseClient();
  const currentCategory = detectCategory(currentNews);

  const { data, error } = await supabase
    .from("news_posts")
    .select("id,slug,title,content,created_at,impact_level")
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

async function getAdjacentNews(currentNews) {
  const supabase = getSupabaseClient();

  const [{ data: previousData }, { data: nextData }] = await Promise.all([
    supabase
      .from("news_posts")
      .select("id,slug,title,content,created_at")
      .lt("created_at", currentNews.created_at)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("news_posts")
      .select("id,slug,title,content,created_at")
      .gt("created_at", currentNews.created_at)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  return {
    previous: previousData?.[0] || null,
    next: nextData?.[0] || null,
  };
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
  const rawImage = getNewsImage(news);
  const image = rawImage && (await isImageReachable(rawImage)) ? rawImage : `${SITE_URL}/favicon.png`;
  const url = `${SITE_URL}${getNewsHref(news)}`;

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
  const adjacentNews = news ? await getAdjacentNews(news) : { previous: null, next: null };

  if (!news) {
    notFound();
  }

  const title = getNewsTitle(news);
  const content = cleanText(news.content || news.summary || news.description || title);
  const rawImage = getNewsImage(news);
  const image = rawImage && (await isImageReachable(rawImage)) ? rawImage : null;
  const publishedDate = new Date(news.created_at).toLocaleString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const isHighImpact = news.impact_level === "HIGH";
  const articleUrl = `${SITE_URL}${getNewsHref(news)}`;
  const category = detectCategory(news);
  const categoryLabel = getCategoryLabel(category);
  const categoryVisual = getCategoryVisual(category);
  const newsTags = detectTags(news);

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
    "@id": articleUrl,
    url: articleUrl,
    inLanguage: "ar",
    isAccessibleForFree: true,
    keywords: [
      title,
      "أخبار اقتصادية",
      "فوركس",
      "عملات رقمية",
      "أسواق عالمية",
    ],
    articleSection: categoryLabel,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    about: {
      "@type": "Thing",
      name: categoryLabel,
    },
    headline: title,
    description: content.slice(0, 180),
    image: image ? [image] : [`${SITE_URL}/favicon.png`],
    datePublished: news.created_at,
    dateModified: news.created_at,
    mainEntityOfPage: articleUrl,
    thumbnailUrl: image || `${SITE_URL}/favicon.png`,
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
        <div className={`relative h-[320px] overflow-hidden bg-gradient-to-br ${categoryVisual.gradient} text-center md:h-[460px]`}>
          <div className={`absolute inset-0 ${image ? "hidden" : "flex"} items-center justify-center fallback-article-image`} style={{ zIndex: 15 }}>
            <div>
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-cyan-300/25 bg-cyan-400/15 text-5xl shadow-[0_0_48px_rgba(34,211,238,0.22)]">
                {categoryVisual.icon}
              </div>
              <div className="text-2xl font-black text-cyan-50">{categoryVisual.label}</div>
              <div className="mt-2 text-sm font-bold text-cyan-100/75">{categoryVisual.subtitle}</div>
              <div className="mt-5 text-[11px] font-black uppercase tracking-[0.35em] text-cyan-200/45">
                HasaN CharT News
              </div>
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
          <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-500" aria-label="مسار التنقل">
            <Link href="/" className="text-slate-500 no-underline transition hover:text-cyan-700">
              الرئيسية
            </Link>
            <span className="text-slate-300">/</span>
            <Link href="/news" className="text-slate-500 no-underline transition hover:text-cyan-700">
              الأخبار
            </Link>
            <span className="text-slate-300">/</span>
            <Link href={`/news/category/${category}`} className="text-cyan-700 no-underline transition hover:text-cyan-900">
              {categoryLabel}
            </Link>
          </nav>

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


import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

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
  if (/default|placeholder|sprite|logo|avatar/i.test(value)) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  return null;
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

  return {
    title: `${title} - HasaN CharT World`,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "HasaN CharT World",
      type: "article",
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description: content.slice(0, 180),
    image: image ? [image] : [`${SITE_URL}/favicon.png`],
    datePublished: news.created_at,
    dateModified: news.created_at,
    mainEntityOfPage: `${SITE_URL}/news/${news.id}`,
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

      <article className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/50 bg-white/85 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        {image ? (
          <div className="relative h-[320px] overflow-hidden bg-slate-950 md:h-[460px]">
            <img src={image} alt={title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent" />
            <div className="absolute right-6 top-6 rounded-full border border-white/40 bg-white/90 px-4 py-2 text-sm font-black text-slate-800 backdrop-blur">
              {isHighImpact ? "🔴 عاجل" : "🟡 مهم"}
            </div>
          </div>
        ) : (
          <div className="relative flex h-[320px] items-center justify-center bg-gradient-to-br from-cyan-950 via-sky-950 to-slate-950 text-center md:h-[420px]">
            <div>
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-cyan-300/25 bg-cyan-400/15 text-5xl shadow-[0_0_48px_rgba(34,211,238,0.22)]">
                📰
              </div>
              <div className="text-2xl font-black text-cyan-50">HasaN CharT News</div>
              <div className="mt-2 text-sm font-bold text-cyan-100/75">تغطية اقتصادية مباشرة</div>
            </div>
          </div>
        )}

        <div className="p-7 md:p-10" dir="rtl">
          <div className="mb-5 inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-500">
            {publishedDate}
          </div>

          <h1 className="mb-7 text-3xl font-black leading-relaxed text-slate-950 md:text-5xl">
            {title}
          </h1>

          <div className="prose prose-lg max-w-none text-slate-700 prose-p:leading-9">
            {content
              .split(/(?<=[.!؟])\s+/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>

          <div className="mt-10 border-t border-slate-200 pt-6 text-center text-sm font-bold text-slate-400">
            تحديث مباشر • HasaN CharT News
          </div>
        </div>
      </article>
    </main>
  );
}
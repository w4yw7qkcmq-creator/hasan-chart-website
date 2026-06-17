"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";


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

export default function News() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  useEffect(() => {
    fetchNews();

    const interval = setInterval(() => {
      fetchNews();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  async function fetchNews() {
    try {
      setErrorMessage("");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        setErrorMessage("إعدادات الأخبار غير مكتملة حالياً.");
        setNews([]);
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase
        .from("news_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("News fetch error:", error);
        setErrorMessage(error.message || "تعذر تحميل الأخبار من قاعدة البيانات.");
        setNews([]);
        return;
      }

      console.log("Fetched news_posts count:", data?.length || 0);
      setNews(data || []);
    } catch (error) {
      console.error("Unexpected news error:", error);
      setErrorMessage(error.message || "حدث خطأ غير متوقع أثناء تحميل الأخبار.");
    } finally {
      setLoading(false);
    }
  }

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

  function fullText(text) {
    const cleaned = cleanNewsText(text);
    if (!cleaned) return "تفاصيل الخبر غير متاحة حالياً.";
    return cleaned;
  }

  function getValidImage(...urls) {
    const candidates = urls.flat().filter(Boolean);

    for (const url of candidates) {
      const imageUrl = String(url).trim();

      if (!imageUrl) continue;
      if (imageUrl.startsWith("/app/assets/")) continue;
      if (imageUrl.includes("default.png")) continue;
      if (imageUrl.includes("placeholder")) continue;
      if (imageUrl.includes("sprite")) continue;
      if (imageUrl.includes("logo")) continue;
      if (imageUrl.includes("avatar")) continue;

      if (imageUrl.startsWith("//")) {
        return `https:${imageUrl}`;
      }

      if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
        return imageUrl;
      }
    }

    return null;
  }

  function getNewsImage(item) {
    return getValidImage(
      item.image_url,
      item.image,
      item.thumbnail_url,
      item.thumbnail,
      item.urlToImage,
      item.url_to_image,
      item.media_url,
      item.source_image_url,
      item.og_image,
      item.cover_image
    );
  }

  function extractArabicTitle(item) {
    const content = cleanNewsText(item.content || "");
    const title = cleanNewsText(item.title || item.normalized_title || "");
    const arabicSentences = content
      .split(/[.!؟\n]/)
      .map((part) => part.trim())
      .filter((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18);

    if (arabicSentences.length > 0) {
      return arabicSentences[0].replace(/^عاجل\s*[:：-]?\s*/i, "");
    }

    return title || "خبر اقتصادي عاجل";
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

  function getNewsCategory(item) {
    const text = `${item.title || ""} ${item.content || ""} ${item.topic_cluster || ""}`.toLowerCase();

    if (text.includes("bitcoin") || text.includes("crypto") || text.includes("btc") || text.includes("ethereum")) {
      return "crypto";
    }

    if (text.includes("gold") || text.includes("oil") || text.includes("silver") || text.includes("commodit")) {
      return "commodities";
    }

    if (text.includes("stock") || text.includes("nasdaq") || text.includes("s&p") || text.includes("dow") || text.includes("earnings")) {
      return "stocks";
    }

    if (text.includes("fed") || text.includes("inflation") || text.includes("jobs") || text.includes("cpi") || text.includes("pmi") || text.includes("gdp")) {
      return "economy";
    }

    if (text.includes("iran") || text.includes("israel") || text.includes("war") || text.includes("gaza") || text.includes("ukraine") || text.includes("russia")) {
      return "geopolitics";
    }

    return "markets";
  }

  function categoryVisual(category) {
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
        icon: "↗",
        label: "الأسواق العالمية",
        subtitle: "أسهم • مؤشرات • وول ستريت",
        gradient: "from-emerald-950 via-green-900 to-slate-950",
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
      markets: {
        icon: "📊",
        label: "تحديثات الأسواق",
        subtitle: "تحركات مؤثرة على التداول",
        gradient: "from-cyan-950 via-sky-950 to-slate-950",
      },
    };

    return visuals[category] || visuals.markets;
  }

  function getNewsHref(item) {
    return `/news/${item?.slug || item?.id}`;
  }

  const categories = [
    { key: "all", label: "الكل" },
    { key: "geopolitics", label: "أخبار جيوسياسية" },
    { key: "economy", label: "الاقتصاد الأمريكي" },
    { key: "stocks", label: "الأسواق العالمية" },
    { key: "crypto", label: "العملات الرقمية" },
    { key: "commodities", label: "النفط والطاقة" },
  ];

  const filteredNews = news.filter((item) => {
    if (selectedCategory === "all") return true;
    return getNewsCategory(item) === selectedCategory;
  });

  return (
    <main className="min-h-screen px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <section className="mb-10 overflow-hidden rounded-[2rem] border border-white/40 bg-white/55 p-8 text-center shadow-[0_20px_80px_rgba(14,165,233,0.12)] backdrop-blur-xl md:p-12">
          <div className="mx-auto mb-4 inline-flex rounded-full border border-cyan-300/40 bg-cyan-100/70 px-5 py-2 text-sm font-black text-cyan-800">
            أخبار اقتصادية مباشرة
          </div>
          <h1 className="mb-4 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
            الأخبار الاقتصادية العاجلة
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-600">
            تغطية مباشرة لأهم أخبار الاقتصاد، الأسواق العالمية، الأسهم، العملات الرقمية، والبيانات المؤثرة على حركة السوق.
          </p>
        </section>

        <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
          {categories.map((category) => {
            const isActive = selectedCategory === category.key;

            return (
              <button
                key={category.key}
                type="button"
                onClick={() => setSelectedCategory(category.key)}
                className={`rounded-2xl border px-5 py-3 text-sm font-black transition-all ${
                  isActive
                    ? "border-cyan-300 bg-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                    : "border-white/50 bg-white/65 text-slate-600 hover:border-cyan-300 hover:bg-white/90"
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        <div className="mb-8 rounded-[1.75rem] border border-white/50 bg-white/75 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mb-4 text-center text-lg font-black text-slate-950">
            الوسوم الشائعة
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {POPULAR_TAGS.map((tag) => (
              <Link
                key={tag.href}
                href={tag.href}
                className="rounded-full bg-cyan-600 px-4 py-2 text-sm font-black !text-white no-underline shadow-lg transition hover:scale-105 hover:bg-cyan-700"
              >
                #{tag.label}
              </Link>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-14 h-14 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : errorMessage ? (
          <div className="bg-red-500/10 border border-red-400/20 rounded-3xl p-10 text-center text-red-200 leading-8">
            تعذر تحميل الأخبار حالياً.
            <br />
            <span className="text-sm text-red-100/80">{errorMessage}</span>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="rounded-3xl border border-white/40 bg-white/70 p-10 text-center text-slate-500 shadow-xl backdrop-blur-xl">
            لا توجد أخبار متاحة حالياً ضمن هذا التصنيف.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredNews.map((item, index) => {
              const newsImpact = item.impact_level || item.importance || item.priority || "MEDIUM";
              const isHighImpact = newsImpact === "HIGH";
              const impactColor = isHighImpact
                ? "bg-red-500/15 text-red-300 border-red-400/30"
                : "bg-amber-500/15 text-amber-300 border-amber-400/30";

              const sourceLink = item.source_link || item.link || null;
              const newsTitle = extractArabicTitle(item);
              const newsContent = fullText(
                item.content || item.summary || item.description || item.ai_summary || item.normalized_title
              );
              const newsImage = getNewsImage(item);
              const sourceName = getSourceName(sourceLink);
              const category = getNewsCategory(item);
              const visual = categoryVisual(category);
              const hasRealImage = Boolean(newsImage);

              return (
                <Link
                  key={item.id}
                  href={getNewsHref(item)}
                  className={`group block overflow-hidden rounded-[1.75rem] border border-white/50 bg-white/85 text-slate-950 no-underline shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-[0_24px_90px_rgba(14,165,233,0.20)] ${index === 0 ? "md:col-span-2 xl:col-span-2" : ""}`}
                >
                  <div className={`relative overflow-hidden bg-gradient-to-br ${visual.gradient} ${index === 0 ? "h-72" : "h-56"}`}>
                    <div className={`absolute inset-0 ${hasRealImage ? "hidden" : "flex"} items-center justify-center text-center fallback-news-image`}>
                      <div className="px-6">
                        <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-cyan-300/25 bg-cyan-400/15 text-5xl shadow-[0_0_48px_rgba(34,211,238,0.22)]">
                          {visual.icon}
                        </div>
                        <div className="text-xl font-black text-cyan-50">{visual.label}</div>
                        <div className="mt-2 text-xs font-bold text-cyan-100/75">{visual.subtitle}</div>
                        <div className="mt-4 text-[10px] font-black uppercase tracking-[0.32em] text-cyan-200/45">
                          HasaN CharT News
                        </div>
                      </div>
                    </div>
                    {newsImage ? (
                      <img
                        src={newsImage}
                        alt={newsTitle}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          const fallback = event.currentTarget.parentElement?.querySelector(".fallback-news-image");
                          if (fallback) {
                            fallback.classList.remove("hidden");
                            fallback.classList.add("flex");
                          }
                        }}
                        className="relative z-10 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 z-20 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
                    <div className="absolute left-4 top-4 z-30 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 backdrop-blur">
                      {sourceName}
                    </div>
                    <div className={`absolute right-4 top-4 z-30 rounded-full border px-3 py-1 text-xs font-black backdrop-blur ${impactColor}`}>
                      {isHighImpact ? "🔴 عاجل" : "🟡 مهم"}
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="mb-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                      {new Date(item.created_at).toLocaleString("ar-SA", {
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric",
                      })}
                    </div>

                    <h2 className={`${index === 0 ? "text-2xl md:text-3xl" : "text-xl"} mb-4 font-black leading-relaxed text-slate-950`}>
                      {newsTitle}
                    </h2>

                    <p className="text-[15px] leading-7 text-slate-600">
                      {newsContent}
                    </p>

                    <div className="mt-6 border-t border-slate-200 pt-5 text-center">
                      <span className="text-xs font-bold text-slate-400">
                        تحديث مباشر • HasaN CharT News
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
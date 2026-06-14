"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function News() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

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
      .replace(/\s+/g, " ")
      .trim();
  }

  function shortText(text, maxLength = 240) {
    const cleaned = cleanNewsText(text);
    if (!cleaned) return "اضغط على المصدر لقراءة تفاصيل الخبر.";
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.slice(0, maxLength).trim()}...`;
  }

  function getValidImage(url) {
    if (!url) return null;
    if (url.startsWith("/app/assets/")) return null;
    if (url.includes("default.png")) return null;
    if (url.includes("trkd-in")) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return null;
  }

  function extractArabicTitle(item) {
    const content = cleanNewsText(item.content || "");
    const title = cleanNewsText(item.title || item.normalized_title || "");
    const arabicSentences = content
      .split(/[.!؟\n]/)
      .map((part) => part.trim())
      .filter((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18);

    if (arabicSentences.length > 0) {
      return arabicSentences[0].replace(/^عاجل\s*[:：-]?\s*/i, "").slice(0, 120);
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
      if (host.includes("t.me")) return "Telegram";
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
      crypto: { icon: "₿", label: "Crypto Market", gradient: "from-orange-950 via-slate-950 to-cyan-950" },
      commodities: { icon: "✦", label: "Commodities", gradient: "from-amber-950 via-slate-950 to-cyan-950" },
      stocks: { icon: "↗", label: "Stock Market", gradient: "from-emerald-950 via-slate-950 to-cyan-950" },
      economy: { icon: "▦", label: "Economic Data", gradient: "from-blue-950 via-slate-950 to-cyan-950" },
      geopolitics: { icon: "⚑", label: "Global Impact", gradient: "from-red-950 via-slate-950 to-cyan-950" },
      markets: { icon: "◆", label: "Market News", gradient: "from-cyan-950 via-blue-950 to-slate-900" },
    };

    return visuals[category] || visuals.markets;
  }

  return (
    <main className="min-h-screen px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <section className="mb-10 overflow-hidden rounded-[2rem] border border-white/40 bg-white/55 p-8 text-center shadow-[0_20px_80px_rgba(14,165,233,0.12)] backdrop-blur-xl md:p-12">
          <div className="mx-auto mb-4 inline-flex rounded-full border border-cyan-300/40 bg-cyan-100/70 px-5 py-2 text-sm font-black text-cyan-800">
            Live Economic News
          </div>
          <h1 className="mb-4 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
            الأخبار الاقتصادية العاجلة
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-600">
            تغطية مباشرة لأهم أخبار الاقتصاد، الأسواق العالمية، الأسهم، العملات الرقمية، والبيانات المؤثرة على حركة السوق.
          </p>
        </section>

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
        ) : news.length === 0 ? (
          <div className="rounded-3xl border border-white/40 bg-white/70 p-10 text-center text-slate-500 shadow-xl backdrop-blur-xl">
            لا توجد أخبار متاحة حالياً. تأكد من وجود سياسة قراءة عامة لجدول news_posts في Supabase.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {news.map((item, index) => {
              const newsImpact = item.impact_level || item.importance || item.priority || "MEDIUM";
              const isHighImpact = newsImpact === "HIGH";
              const impactColor = isHighImpact
                ? "bg-red-500/15 text-red-300 border-red-400/30"
                : "bg-amber-500/15 text-amber-300 border-amber-400/30";

              const sourceLink = item.source_link || item.link || null;
              const newsTitle = extractArabicTitle(item);
              const newsContent = shortText(
                item.content || item.summary || item.description || item.ai_summary || item.normalized_title,
                115
              );
              const newsImage = getValidImage(item.image_url || item.image || item.thumbnail_url);
              const sourceName = getSourceName(sourceLink);
              const category = getNewsCategory(item);
              const visual = categoryVisual(category);

              return (
                <article
                  key={item.id}
                  className={`group overflow-hidden rounded-[1.75rem] border border-white/50 bg-white/85 text-slate-950 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-[0_24px_90px_rgba(14,165,233,0.20)] ${index === 0 ? "md:col-span-2 xl:col-span-2" : ""}`}
                >
                  <div className={`relative overflow-hidden bg-gradient-to-br ${visual.gradient} ${index === 0 ? "h-72" : "h-56"}`}>
                    <div className="absolute inset-0 flex items-center justify-center text-center">
                      <div className="px-6">
                        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-cyan-300/25 bg-cyan-400/15 text-4xl shadow-[0_0_40px_rgba(34,211,238,0.18)]">
                          {visual.icon}
                        </div>
                        <div className="text-base font-black text-cyan-50">{visual.label}</div>
                        <div className="mt-2 text-xs font-bold text-cyan-100/70">تغطية اقتصادية مباشرة</div>
                      </div>
                    </div>
                    {newsImage ? (
                      <img
                        src={newsImage}
                        alt={newsTitle}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          event.currentTarget.removeAttribute("src");
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

                    <h2 className={`${index === 0 ? "text-2xl md:text-3xl" : "text-xl"} mb-4 line-clamp-2 min-h-[72px] font-black leading-relaxed text-slate-950`}>
                      {newsTitle}
                    </h2>

                    <p className="line-clamp-2 min-h-[56px] text-[15px] leading-7 text-slate-600">
                      {newsContent}
                    </p>

                    <div className="mt-6 border-t border-slate-200 pt-5 text-center">
                      <span className="text-xs font-bold text-slate-400">
                        تحديث مباشر • HasaN CharT News
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
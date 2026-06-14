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
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return null;
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-black mb-3">
            الأخبار الاقتصادية العاجلة
          </h1>
          <p className="text-slate-400 text-lg">
            تغطية مباشرة لأهم أخبار الاقتصاد والأسواق العالمية والعملات الرقمية.
          </p>
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
        ) : news.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-3xl p-10 text-center text-slate-400">
            لا توجد أخبار متاحة حالياً. تأكد من وجود سياسة قراءة عامة لجدول news_posts في Supabase.
          </div>
        ) : (
          <div className="space-y-8">
            {news.map((item) => {
              const newsImpact = item.impact_level || item.importance || item.priority || "MEDIUM";
              const isHighImpact = newsImpact === "HIGH";
              const impactColor = isHighImpact
                ? "bg-red-500/15 text-red-300 border-red-400/30"
                : "bg-amber-500/15 text-amber-300 border-amber-400/30";
              const newsTitle = cleanNewsText(item.title || item.normalized_title || "خبر اقتصادي");
              const newsContent = shortText(
                item.content || item.summary || item.description || item.ai_summary || item.normalized_title,
                260
              );
              const newsImage = getValidImage(item.image_url || item.image || item.thumbnail_url);
              const sourceLink = item.source_link || item.link || null;

              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/80 text-slate-950 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-[0_24px_80px_rgba(14,165,233,0.20)]"
                >
                  {newsImage ? (
                    <div className="relative w-full h-[220px] md:h-[360px] overflow-hidden bg-slate-900">
                      <img
                        src={newsImage}
                        alt={newsTitle}
                        className="h-full w-full object-cover transition duration-500 hover:scale-105"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />

                      <div className="absolute top-5 right-5 flex items-center gap-3">
                        <div
                          className={`px-4 py-2 rounded-full border text-sm font-bold ${impactColor}`}
                        >
                          {isHighImpact ? "🚨 عاجل" : "📌 مهم"}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="p-6 md:p-8">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-500">
                        {new Date(item.created_at).toLocaleString("ar-SA", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "numeric",
                          minute: "numeric",
                        })}
                      </div>
                    </div>

                    <h2 className="mb-5 text-2xl font-black leading-relaxed text-slate-950 md:text-3xl">
                      {newsTitle}
                    </h2>

                    <div className="text-[17px] leading-8 text-slate-600">
                      {newsContent}
                    </div>

                    {sourceLink ? (
                      <a
                        href={sourceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-700"
                      >
                        قراءة المصدر ←
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
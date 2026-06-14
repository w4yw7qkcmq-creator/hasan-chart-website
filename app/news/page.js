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
        .from("published_news")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("News fetch error:", error);
        setErrorMessage(error.message || "تعذر تحميل الأخبار من قاعدة البيانات.");
        setNews([]);
        return;
      }

      console.log("Fetched published_news count:", data?.length || 0);
      setNews(data || []);
    } catch (error) {
      console.error("Unexpected news error:", error);
      setErrorMessage(error.message || "حدث خطأ غير متوقع أثناء تحميل الأخبار.");
    } finally {
      setLoading(false);
    }
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
            لا توجد أخبار متاحة حالياً. تأكد من وجود سياسة قراءة عامة لجدول published_news في Supabase.
          </div>
        ) : (
          <div className="space-y-8">
            {news.map((item) => {
              const impactColor =
                item.impact_level === "HIGH"
                  ? "bg-red-500/20 text-red-300 border-red-500/30"
                  : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";

              const newsTitle = item.title || item.normalized_title || "خبر اقتصادي";
              const newsContent =
                item.content ||
                item.summary ||
                item.description ||
                item.ai_summary ||
                item.normalized_title ||
                "اضغط على المصدر لقراءة تفاصيل الخبر.";
              const newsImage = item.image_url || item.image || item.thumbnail_url || null;
              const newsImpact = item.impact_level || item.importance || item.priority || "MEDIUM";

              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl hover:border-cyan-400/30 transition-all duration-300"
                >
                  {newsImage ? (
                    <div className="relative w-full h-[240px] md:h-[420px] overflow-hidden">
                      <img
                        src={newsImage}
                        alt={newsTitle}
                        className="w-full h-full object-cover"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/20 to-transparent" />

                      <div className="absolute top-5 right-5 flex items-center gap-3">
                        <div
                          className={`px-4 py-2 rounded-full border text-sm font-bold ${impactColor}`}
                        >
                          {newsImpact === "HIGH" ? "🚨 عاجل" : "📌 مهم"}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="p-6 md:p-8">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <div className="text-slate-400 text-sm">
                        {new Date(item.created_at).toLocaleString("ar-SA", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "numeric",
                          minute: "numeric",
                        })}
                      </div>
                    </div>

                    <h2 className="text-2xl md:text-3xl font-black leading-relaxed mb-5 text-white">
                      {newsTitle}
                    </h2>

                    <div className="text-slate-300 leading-8 whitespace-pre-line text-[17px]">
                      {newsContent}
                    </div>

                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-5 inline-flex rounded-2xl border border-cyan-400/30 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-400/10"
                      >
                        قراءة المصدر
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
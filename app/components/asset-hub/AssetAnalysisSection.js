"use client";

import "../../styles/daily-analysis.css";
import Link from "next/link";
import { useEffect, useState } from "react";

const DIRECTION_LABELS = {
  bullish: "صاعد",
  bearish: "هابط",
  neutral: "محايد",
};

const ANALYSIS_TYPE_LABELS = {
  daily: "يومي",
  weekly: "أسبوعي",
  urgent: "عاجل",
};

function formatAnalysisDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Damascus",
  }).format(date);
}

/**
 * @param {import("./configs/types").AssetHubConfig} config
 * @param {Record<string, unknown>} item
 */
function isAssetAnalysis(config, item) {
  const keywords = config?.analysis?.keywords || [];
  const symbol = String(item?.symbol || "").toLowerCase();
  const title = String(item?.title || "").toLowerCase();
  const content = String(item?.content || "").toLowerCase();
  const combined = `${symbol} ${title} ${content}`;

  return keywords.some((keyword) => {
    const normalized = String(keyword).toLowerCase();
    if (normalized.length <= 3) {
      return new RegExp(`\\b${normalized}\\b`).test(combined);
    }
    return combined.includes(normalized);
  });
}

function AnalysisSkeletonList() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="public-seo-card animate-pulse rounded-[24px] border border-cyan-300/15 bg-white/[0.04] p-6"
        >
          <div className="mb-3 h-4 w-32 rounded bg-cyan-400/20" />
          <div className="mb-2 h-6 w-3/4 rounded bg-white/10" />
          <div className="h-16 w-full rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function AnalysisCard({ item }) {
  const directionClass = `daily-analysis-card__direction daily-analysis-card__direction--${item.direction}`;

  return (
    <article className="public-seo-card rounded-[24px] border border-cyan-300/15 bg-white/[0.04] p-6 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="daily-analysis-card__symbol">{item.symbol}</span>
          <span className={directionClass}>{DIRECTION_LABELS[item.direction] || item.direction}</span>
          <span className="daily-analysis-card__type">
            {ANALYSIS_TYPE_LABELS[item.analysisType] || item.analysisType}
          </span>
        </div>
        <time className="text-sm text-slate-400" dateTime={item.createdAt || undefined}>
          {formatAnalysisDate(item.createdAt)}
        </time>
      </div>
      <h3 className="mt-4 text-xl font-black text-white">{item.title}</h3>
      <p className="mt-3 line-clamp-4 leading-8 text-slate-300">{item.content}</p>
    </article>
  );
}

/**
 * @param {{ config: import("./configs/types").AssetHubConfig }} props
 */
export default function AssetAnalysisSection({ config }) {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAnalyses() {
      try {
        setErrorMessage("");

        const response = await fetch("/api/daily-analysis", {
          method: "GET",
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "تعذر تحميل التحليلات.");
        }

        const items = Array.isArray(result.analyses)
          ? result.analyses.filter((item) => isAssetAnalysis(config, item))
          : [];

        if (!cancelled) {
          setAnalyses(items.slice(0, 6));
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error?.message || "حدث خطأ أثناء تحميل التحليلات.");
          setAnalyses([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAnalyses();

    return () => {
      cancelled = true;
    };
  }, [config]);

  const headingId = `${config.id}-analysis-heading`;

  return (
    <section className="space-y-5" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-3xl font-black text-white md:text-4xl">
            آخر تحليلات {config.name}
          </h2>
          <p className="mt-3 text-slate-400">
            تحليلات منشورة من التحليلات اليومية — مفلترة لأصل {config.symbol} فقط.
          </p>
        </div>
        <Link
          href="/daily-analysis"
          className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-sm font-black text-cyan-100 no-underline transition hover:bg-cyan-400/20"
        >
          كل التحليلات
        </Link>
      </div>

      {loading ? <AnalysisSkeletonList /> : null}

      {!loading && errorMessage ? (
        <div className="public-seo-card rounded-[24px] border border-amber-300/20 bg-amber-400/10 p-6 text-amber-100">
          {errorMessage}
        </div>
      ) : null}

      {!loading && !errorMessage && analyses.length === 0 ? (
        <div className="public-seo-card rounded-[24px] border border-dashed border-cyan-300/25 bg-white/[0.03] p-8 text-center">
          <p className="text-lg font-black text-white">
            لا توجد تحليلات {config.symbol} منشورة حالياً
          </p>
          <p className="mt-3 text-slate-400">
            سيتم عرض آخر التحليلات الخاصة بـ {config.name} هنا عند نشرها في التحليلات اليومية.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/analysis/request"
              className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-3 font-black text-white no-underline"
            >
              طلب تحليل {config.symbol}
            </Link>
            <Link
              href="/daily-analysis"
              className="rounded-2xl border border-cyan-300/20 bg-black/25 px-6 py-3 font-black text-cyan-100 no-underline"
            >
              التحليلات اليومية
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && analyses.length > 0 ? (
        <div className="space-y-4">
          {analyses.map((item) => (
            <AnalysisCard key={item.id || `${item.symbol}-${item.createdAt}`} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import {
  detectNewsCategory,
  getNewsCategoryVisual,
  resolveNewsImageUrl,
} from "../../lib/news-images";
import { NewsCoverImage } from "../components/news/NewsCoverImage";

const SOURCE_LABEL = "HasaN CharT World";

const NEWS_CATEGORIES = [
  { key: "all", label: "الكل", href: "/news", filterOnPage: true },
  { key: "crypto", label: "العملات الرقمية", href: "/news/category/crypto" },
  { key: "stocks", label: "الأسواق العالمية", href: "/news/category/stocks" },
  { key: "economy", label: "الاقتصاد الأمريكي", href: "/news/category/economy" },
  { key: "commodities", label: "النفط والطاقة", href: "/news/category/commodities" },
  { key: "metals", label: "المعادن", href: null, filterOnPage: true },
  { key: "geopolitics", label: "الجيوسياسية", href: "/news/category/geopolitics" },
];

function formatNewsDate(value) {
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

function cleanNewsText(text) {
  if (!text) return "";

  return String(text)
    .replace(/https?:\/\/t\.me\/[^\s]+/gi, "")
    .replace(/قناة الأخبار الرسمية\s*:*/gi, "")
    .replace(/🔊|📢/g, "")
    .replace(/\b(Reuters|CNBC|Investing\.com|MarketWatch|CoinDesk|Telegram)\b\s*[-–—:]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeExcerpt(text, maxLength = 210) {
  const value = cleanNewsText(text);
  if (!value) return "تفاصيل الخبر غير متاحة حالياً.";
  if (value.length <= maxLength) return value;

  const trimmed = value.slice(0, maxLength).trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  const safeCut = lastSpace > maxLength * 0.65 ? trimmed.slice(0, lastSpace) : trimmed;

  return `${safeCut}…`;
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

function isMetalsNews(item) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.topic_cluster || ""}`.toLowerCase();
  return /gold|silver|xau|xag|platinum|copper|metal|precious|ذهب|فضة|معادن|نحاس/.test(text);
}

function matchesCategoryFilter(item, categoryKey) {
  if (categoryKey === "all") return true;
  if (categoryKey === "metals") return isMetalsNews(item);
  return detectNewsCategory(item) === categoryKey;
}

function getNewsHref(item) {
  return `/news/${item?.slug || item?.id}`;
}

function NewsSkeletonGrid() {
  return (
    <div className="news-page-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="news-card news-card--skeleton">
          <div className="news-card__media news-card__media--skeleton" />
          <div className="news-card__body">
            <div className="news-skeleton-line news-skeleton-line--sm" />
            <div className="news-skeleton-line news-skeleton-line--lg" />
            <div className="news-skeleton-line news-skeleton-line--md" />
            <div className="news-skeleton-line news-skeleton-line--full" />
            <div className="news-skeleton-line news-skeleton-line--btn" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NewsCategoryNav({ selectedCategory, onSelectCategory }) {
  return (
    <nav className="news-page-categories" aria-label="تصنيفات الأخبار">
      {NEWS_CATEGORIES.map((category) => {
        const isActive = selectedCategory === category.key;

        if (category.filterOnPage) {
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => onSelectCategory(category.key)}
              className={`news-page-category ${isActive ? "news-page-category--active" : ""}`}
              aria-pressed={isActive}
            >
              {category.label}
            </button>
          );
        }

        return (
          <Link
            key={category.key}
            href={category.href}
            className="news-page-category"
          >
            {category.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NewsCard({ item, index }) {
  const newsImpact = item.impact_level || item.importance || item.priority || "MEDIUM";
  const isHighImpact = newsImpact === "HIGH";
  const newsTitle = extractArabicTitle(item);
  const newsContent = makeExcerpt(
    item.summary || item.description || item.ai_summary || item.content || item.normalized_title
  );
  const newsImage = resolveNewsImageUrl(item);
  const category = detectNewsCategory(item);
  const visual = getNewsCategoryVisual(category);
  const categoryLabel =
    category === "commodities" && isMetalsNews(item) ? "المعادن" : visual.label;

  const fallbackVisual = (
    <div className="news-card__fallback-inner">
      <span className="news-card__fallback-icon" aria-hidden="true">
        {visual.icon}
      </span>
      <span className="news-card__fallback-label">{categoryLabel}</span>
      <span className="news-card__fallback-sub">{visual.subtitle}</span>
    </div>
  );

  return (
    <article className="news-card">
      <div className={`news-card__media news-card__media--${category}`}>
        <NewsCoverImage
          src={newsImage}
          alt={newsTitle}
          loading={index < 3 ? "eager" : "lazy"}
          fallback={fallbackVisual}
        />
        <div className="news-card__media-overlay" aria-hidden="true" />
        <div className="news-card__badges">
          <span className="news-card__badge news-card__badge--source">{SOURCE_LABEL}</span>
          <span
            className={`news-card__badge ${
              isHighImpact ? "news-card__badge--urgent" : "news-card__badge--important"
            }`}
          >
            {isHighImpact ? "عاجل" : "مهم"}
          </span>
        </div>
      </div>

      <div className="news-card__body">
        <div className="news-card__meta">
          <time className="news-card__date" dateTime={item.created_at || undefined}>
            {formatNewsDate(item.created_at)}
          </time>
          <span className="news-card__category">{categoryLabel}</span>
        </div>

        <h2 className="news-card__title">{newsTitle}</h2>

        <p className="news-card__excerpt">{newsContent}</p>

        <Link href={getNewsHref(item)} className="news-card__cta">
          قراءة التفاصيل
        </Link>
      </div>
    </article>
  );
}

export default function News() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    fetchNews();

    const interval = setInterval(() => {
      fetchNews({ silent: true });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  async function fetchNews({ silent = false } = {}) {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setErrorMessage("");

      const { data, error } = await supabase
        .from("news_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.warn("News fetch skipped:", error.message || error);
        setErrorMessage(error.message || "تعذر تحميل الأخبار من قاعدة البيانات.");
        setNews([]);
        return;
      }

      setNews(data || []);
      setLastUpdated(formatNewsDate(new Date()));
    } catch (error) {
      console.warn("News fetch skipped:", error?.message || error);
      setErrorMessage(error?.message || "حدث خطأ غير متوقع أثناء تحميل الأخبار.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const filteredNews = useMemo(() => {
    return news.filter((item) => matchesCategoryFilter(item, selectedCategory));
  }, [news, selectedCategory]);

  return (
    <main className="news-page">
      <div className="news-page__bg" aria-hidden="true" />

      <div className="news-page__inner">
        <header className="news-page-hero">
          <span className="news-page-hero__eyebrow">تغطية مالية مباشرة</span>
          <h1 className="news-page-hero__title">الأخبار الاقتصادية العاجلة</h1>
          <p className="news-page-hero__text">
            تغطية يومية لأهم تحركات الأسواق العالمية، العملات الرقمية، النفط والمعادن،
            والبيانات الاقتصادية المؤثرة على قرارات التداول.
          </p>

          <div className="news-page-hero__actions">
            <button
              type="button"
              onClick={() => fetchNews()}
              disabled={loading || refreshing}
              className="news-page-hero__refresh"
            >
              {loading || refreshing ? "جاري التحديث…" : "تحديث الأخبار الآن"}
            </button>
            {lastUpdated ? (
              <span className="news-page-hero__updated">آخر تحديث: {lastUpdated}</span>
            ) : null}
          </div>
        </header>

        <NewsCategoryNav
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />

        {loading ? (
          <NewsSkeletonGrid />
        ) : errorMessage ? (
          <div className="news-page-state news-page-state--error" role="alert">
            <span className="news-page-state__icon" aria-hidden="true">
              ⚠️
            </span>
            <h2 className="news-page-state__title">تعذر تحميل الأخبار حالياً</h2>
            <p className="news-page-state__text">{errorMessage}</p>
            <button type="button" onClick={() => fetchNews()} className="news-page-state__action">
              إعادة المحاولة
            </button>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="news-page-state">
            <span className="news-page-state__icon" aria-hidden="true">
              📰
            </span>
            <h2 className="news-page-state__title">لا توجد أخبار حالياً</h2>
            <p className="news-page-state__text">
              {selectedCategory === "all"
                ? "لم يتم نشر أخبار جديدة بعد. حاول التحديث لاحقاً."
                : "لا توجد أخبار ضمن هذا التصنيف حالياً."}
            </p>
            {selectedCategory !== "all" ? (
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className="news-page-state__action"
              >
                عرض كل الأخبار
              </button>
            ) : (
              <button type="button" onClick={() => fetchNews()} className="news-page-state__action">
                تحديث الأخبار
              </button>
            )}
          </div>
        ) : (
          <section className="news-page-grid" aria-label="قائمة الأخبار">
            {filteredNews.map((item, index) => (
              <NewsCard key={item.id} item={item} index={index} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

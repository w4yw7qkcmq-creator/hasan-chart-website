"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Breadcrumbs from "../../components/seo/Breadcrumbs";
import {
  DAILY_ANALYSIS_FILTERS,
  DAILY_ANALYSIS_HUB_LINKS,
  TRENDING_MARKET_LINKS,
  getAnalysisAnchorId,
  getAnalysisAssetName,
  getAnalysisMarketLabel,
  matchesDailyAnalysisFilter,
  resolveAnalysisAsset,
} from "../../components/daily-analysis/dailyAnalysisHelpers";

const DailyAnalysisAdminForm = dynamic(() => import("./DailyAnalysisAdminForm"), {
  ssr: false,
});

const DIRECTION_OPTIONS = [
  { value: "bullish", label: "صاعد" },
  { value: "bearish", label: "هابط" },
  { value: "neutral", label: "محايد" },
];

const ANALYSIS_TYPE_OPTIONS = [
  { value: "daily", label: "يومي" },
  { value: "weekly", label: "أسبوعي" },
  { value: "urgent", label: "عاجل" },
];

const DIRECTION_LABELS = Object.fromEntries(DIRECTION_OPTIONS.map((item) => [item.value, item.label]));
const ANALYSIS_TYPE_LABELS = Object.fromEntries(
  ANALYSIS_TYPE_OPTIONS.map((item) => [item.value, item.label])
);

const PAGE_BREADCRUMBS = [
  { label: "الرئيسية", href: "/" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
];

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

function AnalysisSkeletonGrid() {
  return (
    <div className="daily-analysis-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="daily-analysis-card daily-analysis-card--skeleton">
          <div className="daily-analysis-skeleton daily-analysis-skeleton--lg" />
          <div className="daily-analysis-skeleton daily-analysis-skeleton--sm" />
          <div className="daily-analysis-skeleton daily-analysis-skeleton--md" />
          <div className="daily-analysis-skeleton daily-analysis-skeleton--full" />
        </div>
      ))}
    </div>
  );
}

function AnalysisFilters({ selectedFilter, onSelectFilter }) {
  return (
    <nav className="daily-analysis-filters" aria-label="تصنيفات التحليلات">
      {DAILY_ANALYSIS_FILTERS.map((filter) => {
        const isActive = selectedFilter === filter.key;

        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => onSelectFilter(filter.key)}
            className={`daily-analysis-filter ${isActive ? "daily-analysis-filter--active" : ""}`}
            aria-pressed={isActive}
          >
            {filter.label}
          </button>
        );
      })}
    </nav>
  );
}

function TrendingMarketsSection() {
  return (
    <section className="daily-analysis-trending" aria-label="الأسواق الأكثر متابعة">
      <div className="daily-analysis-trending__head">
        <h2 className="daily-analysis-trending__title">الأسواق الأكثر متابعة</h2>
        <p className="daily-analysis-trending__text">
          انتقل مباشرة إلى صفحات الأصول الأكثر طلباً في HasaN CharT World
        </p>
      </div>

      <div className="daily-analysis-trending__grid">
        {TRENDING_MARKET_LINKS.map((market) => (
          <Link key={market.href} href={market.href} className="daily-analysis-trending__card">
            <span className="daily-analysis-trending__symbol">{market.symbol}</span>
            <span className="daily-analysis-trending__label">{market.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RequestAnalysisSection() {
  return (
    <section className="daily-analysis-request" aria-label="اطلب تحليلك الخاص">
      <div>
        <h2 className="daily-analysis-request__title">اطلب تحليلك الخاص</h2>
        <p className="daily-analysis-request__text">
          احصل على رؤية مخصصة لسوقك من فريق HasaN CharT World عندما تحتاج قراراً أوضح.
        </p>
      </div>
      <Link href="/analysis/request" className="daily-analysis-request__cta">
        طلب تحليل مخصص
      </Link>
    </section>
  );
}

function HubLinksSection() {
  return (
    <nav className="daily-analysis-hub-links" aria-label="روابط داخلية">
      {DAILY_ANALYSIS_HUB_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="daily-analysis-hub-link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function AnalysisCard({ item }) {
  const directionClass = `daily-analysis-card__direction daily-analysis-card__direction--${item.direction}`;
  const asset = resolveAnalysisAsset(item.symbol, item.title);
  const assetName = getAnalysisAssetName(item);
  const marketLabel = getAnalysisMarketLabel(item);
  const anchorId = getAnalysisAnchorId(item.id);

  return (
    <article id={anchorId} className="daily-analysis-card">
      <div className="daily-analysis-card__head">
        <div className="daily-analysis-card__tags">
          <span className="daily-analysis-card__asset">{assetName}</span>
          <span className="daily-analysis-card__market">{marketLabel}</span>
          <span className="daily-analysis-card__symbol">{item.symbol}</span>
          <span className={directionClass}>{DIRECTION_LABELS[item.direction] || item.direction}</span>
          <span className="daily-analysis-card__type">
            {ANALYSIS_TYPE_LABELS[item.analysisType] || item.analysisType}
          </span>
        </div>
        <time className="daily-analysis-card__date" dateTime={item.createdAt || undefined}>
          {formatAnalysisDate(item.createdAt)}
        </time>
      </div>

      <h2 className="daily-analysis-card__title">{item.title}</h2>

      <div className="daily-analysis-card__content">{item.content}</div>

      {item.notes ? (
        <div className="daily-analysis-card__notes">
          <strong>ملاحظات:</strong> {item.notes}
        </div>
      ) : null}

      <div className="daily-analysis-card__actions">
        {asset ? (
          <Link href={asset.path} className="daily-analysis-card__asset-link">
            صفحة {asset.symbol}
          </Link>
        ) : null}
        <a href={`#${anchorId}`} className="daily-analysis-card__cta">
          اقرأ التحليل
        </a>
      </div>

      <p className="daily-analysis-card__source">HasaN CharT World</p>
    </article>
  );
}

function AnalysisEmptyState({ selectedFilter, onResetFilter }) {
  return (
    <div className="daily-analysis-state">
      <span className="daily-analysis-state__icon" aria-hidden="true">
        📝
      </span>
      <h2 className="daily-analysis-state__title">لا توجد تحليلات مطابقة حالياً</h2>
      <p className="daily-analysis-state__text">
        {selectedFilter === "all"
          ? "سيتم عرض أحدث التحليلات هنا فور نشرها من الفريق. يمكنك طلب تحليل مخصص أو استكشاف الأسواق."
          : "لا توجد تحليلات ضمن هذا التصنيف حالياً. جرّب فلتراً آخر أو اطلب تحليلاً مخصصاً."}
      </p>

      <div className="daily-analysis-state__actions">
        {selectedFilter !== "all" ? (
          <button type="button" onClick={onResetFilter} className="daily-analysis-state__action">
            عرض كل التحليلات
          </button>
        ) : null}
        <Link href="/analysis/request" className="daily-analysis-state__action daily-analysis-state__action--link">
          طلب تحليل
        </Link>
        <Link href="/markets" className="daily-analysis-state__action daily-analysis-state__action--link">
          استكشاف الأسواق
        </Link>
        <Link href="/" className="daily-analysis-state__action daily-analysis-state__action--link">
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

export default function DailyAnalysisClient() {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [canPublish, setCanPublish] = useState(false);
  const [adminAccessChecked, setAdminAccessChecked] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("all");
  const loadInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const loadAnalyses = useCallback(async () => {
    if (loadInFlightRef.current) {
      return;
    }

    loadInFlightRef.current = true;

    try {
      setErrorMessage("");

      const response = await fetch("/api/daily-analysis", {
        method: "GET",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحميل التحليلات.");
      }

      setAnalyses(Array.isArray(result.analyses) ? result.analyses : []);
      hasLoadedOnceRef.current = true;
    } catch (error) {
      setErrorMessage(error?.message || "حدث خطأ أثناء تحميل التحليلات.");
      if (!hasLoadedOnceRef.current) {
        setAnalyses([]);
      }
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/daily-analysis/admin-access", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => response.json().catch(() => null))
      .then((result) => {
        if (!cancelled) {
          setCanPublish(Boolean(result?.success && result?.allowed));
        }
      })
      .catch(() => {
        if (!cancelled) setCanPublish(false);
      })
      .finally(() => {
        if (!cancelled) setAdminAccessChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredAnalyses = useMemo(() => {
    return analyses.filter((item) => matchesDailyAnalysisFilter(item, selectedFilter));
  }, [analyses, selectedFilter]);

  const handlePublished = (analysis) => {
    if (analysis?.id) {
      setAnalyses((current) => [analysis, ...current.filter((item) => item.id !== analysis.id)]);
      return;
    }

    loadAnalyses();
  };

  return (
    <main className="daily-analysis-page">
      <div className="daily-analysis-page__bg" aria-hidden="true" />

      <div className="daily-analysis-page__inner">
        <div className="daily-analysis-breadcrumb">
          <Breadcrumbs items={PAGE_BREADCRUMBS} variant="dark" />
        </div>

        {adminAccessChecked && canPublish ? (
          <DailyAnalysisAdminForm onPublished={handlePublished} />
        ) : null}

        <header className="daily-analysis-hero">
          <span className="daily-analysis-hero__eyebrow">تحليلات HasaN CharT</span>
          <h1 className="daily-analysis-hero__title">التحليلات اليومية</h1>
          <p className="daily-analysis-hero__text">
            آخر تحليلات الأسواق من فريق HasaN CharT World — رؤية يومية واضحة للعملات
            الرقمية، الفوركس، الذهب والسلع، والأسهم والمؤشرات.
          </p>

          <div className="daily-analysis-hero__actions">
            <Link href="/analysis/request" className="daily-analysis-hero__cta">
              طلب تحليل
            </Link>
            <Link href="/subscriptions" className="daily-analysis-hero__cta daily-analysis-hero__cta--secondary">
              الاشتراكات
            </Link>
            <Link href="/assets" className="daily-analysis-hero__cta daily-analysis-hero__cta--secondary">
              الأصول والأسواق
            </Link>
          </div>
        </header>

        <HubLinksSection />
        <AnalysisFilters selectedFilter={selectedFilter} onSelectFilter={setSelectedFilter} />
        <TrendingMarketsSection />

        {loading ? (
          <AnalysisSkeletonGrid />
        ) : errorMessage ? (
          <div className="daily-analysis-state daily-analysis-state--error" role="alert">
            <span className="daily-analysis-state__icon" aria-hidden="true">
              ⚠️
            </span>
            <h2 className="daily-analysis-state__title">تعذر تحميل التحليلات</h2>
            <p className="daily-analysis-state__text">{errorMessage}</p>
            <div className="daily-analysis-state__actions">
              <button type="button" onClick={loadAnalyses} className="daily-analysis-state__action">
                إعادة المحاولة
              </button>
              <Link href="/" className="daily-analysis-state__action daily-analysis-state__action--link">
                العودة للرئيسية
              </Link>
            </div>
          </div>
        ) : filteredAnalyses.length === 0 ? (
          <AnalysisEmptyState
            selectedFilter={selectedFilter}
            onResetFilter={() => setSelectedFilter("all")}
          />
        ) : (
          <section className="daily-analysis-grid" aria-label="قائمة التحليلات">
            {filteredAnalyses.map((item) => (
              <AnalysisCard key={item.id} item={item} />
            ))}
          </section>
        )}

        <RequestAnalysisSection />
      </div>
    </main>
  );
}

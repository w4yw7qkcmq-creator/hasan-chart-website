"use client";

import Link from "next/link";
import {
  detectNewsCategory,
  getNewsCategoryVisual,
  resolveNewsImageUrl,
} from "../../../lib/news-images";
import { NewsCoverImage } from "./NewsCoverImage";
import {
  getNewsCardAssets,
  getNewsMarketLabel,
  isMetalsNews,
  NEWS_HUB_LINKS,
  NEWS_LIST_FILTERS,
} from "./newsListHelpers";
import {
  extractArabicTitle,
  formatNewsDate,
  getNewsHref,
  makeExcerpt,
  SOURCE_LABEL,
} from "./newsListFormatting";

export function NewsSkeletonGrid() {
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

export function NewsCategoryNav({ selectedCategory, onSelectCategory }) {
  return (
    <nav className="news-page-categories" aria-label="تصنيفات الأخبار">
      {NEWS_LIST_FILTERS.map((category) => {
        const isActive = selectedCategory === category.key;

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
      })}
    </nav>
  );
}

export function NewsHubLinks() {
  return (
    <nav className="news-page-hub-links" aria-label="روابط الأسواق والأخبار">
      {NEWS_HUB_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="news-page-hub-link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function NewsSearchBar({ value, onChange }) {
  return (
    <div className="news-page-search" role="search">
      <label className="news-page-search__label" htmlFor="news-page-search-input">
        بحث في الأخبار
      </label>
      <input
        id="news-page-search-input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="ابحث بالعنوان أو الكلمات المفتاحية…"
        className="news-page-search__input"
        dir="rtl"
      />
    </div>
  );
}

export function NewsCard({ item, index, compact = false, priority = false }) {
  const newsImpact = item.impact_level || "MEDIUM";
  const isHighImpact = newsImpact === "HIGH";
  const newsTitle = extractArabicTitle(item);
  const newsContent = makeExcerpt(
    item.content || item.title
  );
  const newsImage = resolveNewsImageUrl(item);
  const category = detectNewsCategory(item);
  const visual = getNewsCategoryVisual(category);
  const marketLabel = getNewsMarketLabel(item);
  const relatedAssetSymbols = getNewsCardAssets(item);
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
    <article className={`news-card ${compact ? "news-card--compact" : ""}`}>
      <div className={`news-card__media news-card__media--${category}`}>
        <NewsCoverImage
          src={newsImage}
          alt={newsTitle}
          priority={priority}
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
          <span className="news-card__market">{marketLabel}</span>
        </div>

        {relatedAssetSymbols.length > 0 ? (
          <div className="news-card__assets" aria-label="الأصول المرتبطة">
            {relatedAssetSymbols.map((symbol) => (
              <span key={symbol} className="news-card__asset-chip">
                {symbol}
              </span>
            ))}
          </div>
        ) : null}

        <h2 className="news-card__title">{newsTitle}</h2>

        {!compact ? <p className="news-card__excerpt">{newsContent}</p> : null}

        <Link href={getNewsHref(item)} className="news-card__cta">
          اقرأ التفاصيل
        </Link>
      </div>
    </article>
  );
}

export function NewsHighImpactSection({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="news-page-high-impact" aria-label="الأخبار الأكثر تأثيراً">
      <div className="news-page-high-impact__header">
        <div>
          <span className="news-page-high-impact__eyebrow">تغطية مباشرة</span>
          <h2 className="news-page-high-impact__title">الأخبار الأكثر تأثيراً</h2>
        </div>
        <p className="news-page-high-impact__text">
          آخر الأخبار عالية التأثير أو الأكثر أهمية للأسواق الآن
        </p>
      </div>

      <div className="news-page-high-impact__grid">
        {items.map((item, index) => (
          <NewsCard key={item.id} item={item} index={index} compact priority={index === 0} />
        ))}
      </div>
    </section>
  );
}

export function NewsEmptyState({
  selectedCategory,
  searchQuery,
  onResetFilters,
  onRefresh,
}) {
  const hasFilters = selectedCategory !== "all" || Boolean(searchQuery.trim());

  return (
    <div className="news-page-state">
      <span className="news-page-state__icon" aria-hidden="true">
        📰
      </span>
      <h2 className="news-page-state__title">لا توجد أخبار مطابقة حالياً</h2>
      <p className="news-page-state__text">
        {hasFilters
          ? "جرّب تغيير الفلتر أو البحث، أو عد لاحقاً عند نشر أخبار جديدة."
          : "لم يتم نشر أخبار جديدة بعد. يمكنك العودة لاحقاً أو استكشاف صفحات الأسواق."}
      </p>

      <div className="news-page-state__actions">
        {hasFilters ? (
          <button type="button" onClick={onResetFilters} className="news-page-state__action">
            إعادة ضبط الفلاتر
          </button>
        ) : (
          <button type="button" onClick={onRefresh} className="news-page-state__action">
            تحديث الأخبار
          </button>
        )}
        <Link href="/" className="news-page-state__action news-page-state__action--link">
          العودة للرئيسية
        </Link>
        <Link href="/markets" className="news-page-state__action news-page-state__action--link">
          استكشاف الأسواق
        </Link>
      </div>
    </div>
  );
}

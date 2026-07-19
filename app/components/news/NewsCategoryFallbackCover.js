"use client";

import {
  formatNewsFallbackDate,
  getNewsCategoryFallbackTheme,
  truncateNewsFallbackTitle,
} from "../../../lib/news-category-fallback-theme";

export function NewsCategoryFallbackCover({
  item = null,
  category = null,
  title = "",
  createdAt = null,
  variant = "card",
  className = "",
}) {
  const theme = getNewsCategoryFallbackTheme(item || {}, { category });
  const displayTitle = truncateNewsFallbackTitle(
    title,
    variant === "article" ? 140 : variant === "compact" ? 72 : 96
  );
  const publishedAt = createdAt || item?.created_at || null;
  const formattedDate = formatNewsFallbackDate(publishedAt);

  return (
    <div
      className={`news-fallback-cover news-fallback-cover--${variant} ${theme.cssClass} ${className}`.trim()}
      aria-hidden="true"
    >
      <div className="news-fallback-cover__glow" aria-hidden="true" />
      <div className="news-fallback-cover__watermark" aria-hidden="true">
        {theme.icon}
      </div>

      <div className="news-fallback-cover__top">
        <span className="news-fallback-cover__badge news-fallback-cover__badge--category">
          {theme.categoryLabel}
        </span>
        {theme.isUrgent ? (
          <span className="news-fallback-cover__badge news-fallback-cover__badge--urgent">
            عاجل
          </span>
        ) : null}
      </div>

      <div className="news-fallback-cover__body">
        <p className="news-fallback-cover__title">{displayTitle}</p>
      </div>

      {formattedDate ? (
        <div className="news-fallback-cover__footer">
          <time dateTime={publishedAt}>{formattedDate}</time>
        </div>
      ) : null}
    </div>
  );
}

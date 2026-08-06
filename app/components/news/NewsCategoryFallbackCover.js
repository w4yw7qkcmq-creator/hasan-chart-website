"use client";
import { getNewsCategoryFallbackTheme } from "../../../lib/news-category-fallback-theme";
export function NewsCategoryFallbackCover({
  item = null,
  category = null,
  variant = "card",
  className = "",
}) {
  const theme = getNewsCategoryFallbackTheme(item || {}, { category });
  return (
    <div
      className={`news-fallback-cover news-fallback-cover--${variant} ${theme.cssClass} ${className}`.trim()}
      aria-hidden="true"
    >
      {" "}
      <div className="news-fallback-cover__pattern" aria-hidden="true" />{" "}
      <div className="news-fallback-cover__grain" aria-hidden="true" />{" "}
      <div className="news-fallback-cover__vignette" aria-hidden="true" />{" "}
      <div className="news-fallback-cover__glow" aria-hidden="true" />{" "}
      <div className="news-fallback-cover__watermark" aria-hidden="true">
        {" "}
        HC{" "}
      </div>{" "}
      {theme.isUrgent ? (
        <div className="news-fallback-cover__top">
          {" "}
          <span className="news-fallback-cover__badge news-fallback-cover__badge--urgent">
            عاجل
          </span>{" "}
        </div>
      ) : null}{" "}
      <div className="news-fallback-cover__hero">
        {" "}
        <div className="news-fallback-cover__icon-ring">
          {" "}
          <span className="news-fallback-cover__icon">{theme.icon}</span>{" "}
        </div>{" "}
      </div>{" "}
      <div className="news-fallback-cover__shade" aria-hidden="true" />{" "}
      <div className="news-fallback-cover__footer">
        {" "}
        <span className="news-fallback-cover__category">
          {theme.categoryLabel}
        </span>{" "}
      </div>{" "}
    </div>
  );
}

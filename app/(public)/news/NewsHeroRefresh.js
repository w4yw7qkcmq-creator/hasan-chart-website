"use client";

import { useNewsListControls } from "./NewsListContext";

export default function NewsHeroRefresh() {
  const { loading, refreshing, lastUpdated, onManualRefresh } = useNewsListControls();

  return (
    <div className="news-page-hero__actions">
      <button
        type="button"
        onClick={onManualRefresh}
        disabled={loading || refreshing}
        className="news-page-hero__refresh"
      >
        {loading || refreshing ? "جاري التحديث…" : "تحديث الأخبار الآن"}
      </button>
      {lastUpdated ? (
        <span className="news-page-hero__updated">آخر تحديث: {lastUpdated}</span>
      ) : null}
    </div>
  );
}

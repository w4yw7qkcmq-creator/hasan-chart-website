"use client";

export default function AdminUsersResultFooter({ summary, page = 1, totalPages = 1, onPageChange }) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="au-footer">
      <p className="au-footer__status">{summary}</p>
      {totalPages > 1 ? (
        <div className="au-toolbar" aria-label="تصفح النتائج">
          <button
            type="button"
            className="au-btn"
            disabled={!canPrev}
            onClick={() => onPageChange?.(page - 1)}
            aria-label="الصفحة السابقة"
          >
            السابق
          </button>
          <span className="au-badge">
            صفحة {page.toLocaleString("ar")} من {totalPages.toLocaleString("ar")}
          </span>
          <button
            type="button"
            className="au-btn"
            disabled={!canNext}
            onClick={() => onPageChange?.(page + 1)}
            aria-label="الصفحة التالية"
          >
            التالي
          </button>
        </div>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { buildArchivePageHref } from "../../../lib/news-sitemap-shared";

export default function NewsArchivePagination({ page, totalPages }) {
  if (!totalPages || totalPages <= 1) {
    return null;
  }

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      className="mt-10 flex flex-wrap items-center justify-center gap-4"
      aria-label="تصفح أرشيف الأخبار"
    >
      {hasPrevious ? (
        <Link
          href={buildArchivePageHref(page - 1)}
          rel={page - 1 > 1 ? "prev" : undefined}
          className="rounded-2xl border border-cyan-300/50 bg-white/80 px-5 py-3 text-sm font-black text-cyan-800 no-underline shadow-lg transition hover:bg-cyan-600 hover:!text-white"
        >
          ← الصفحة السابقة
        </Link>
      ) : null}

      <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
        صفحة {page} من {totalPages}
      </span>

      {hasNext ? (
        <Link
          href={buildArchivePageHref(page + 1)}
          rel="next"
          className="rounded-2xl border border-cyan-300/50 bg-cyan-600 px-5 py-3 text-sm font-black !text-white no-underline shadow-lg transition hover:bg-cyan-700"
        >
          الصفحة التالية →
        </Link>
      ) : null}
    </nav>
  );
}

export { buildArchivePageHref as buildArchiveHref };

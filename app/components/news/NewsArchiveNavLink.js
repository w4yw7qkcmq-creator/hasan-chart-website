import Link from "next/link";
import { getCachedNewsArchiveSummary } from "../../../lib/news-archive-data";

export default async function NewsArchiveNavLink() {
  const summary = await getCachedNewsArchiveSummary();

  if (!summary?.totalPages || summary.totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-6 flex justify-center">
      <Link
        href="/news/archive/2"
        rel="next"
        className="inline-flex rounded-2xl border border-cyan-300/50 bg-cyan-600 px-6 py-3 text-sm font-black !text-white no-underline shadow-lg shadow-cyan-600/20 transition hover:bg-cyan-700"
      >
        تصفح أرشيف الأخبار ({summary.totalPages} صفحات) →
      </Link>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";

const NewsListClient = dynamic(() => import("./NewsListClient"), {
  ssr: false,
  loading: () => (
    <main className="news-list-page min-h-screen px-4 py-10" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-7xl">
        <div className="news-list-skeleton rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center text-slate-300">
          جاري تحميل الأخبار...
        </div>
      </div>
    </main>
  ),
});

export default function NewsListClientOnly() {
  return <NewsListClient />;
}

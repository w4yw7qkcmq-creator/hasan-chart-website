"use client";

import dynamic from "next/dynamic";

const DailyAnalysisClient = dynamic(() => import("./DailyAnalysisClient"), {
  ssr: false,
  loading: () => (
    <main className="daily-analysis-page min-h-screen px-4 py-10" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center text-slate-300">
          جاري تحميل التحليلات اليومية...
        </div>
      </div>
    </main>
  ),
});

export default function DailyAnalysisClientOnly() {
  return <DailyAnalysisClient />;
}

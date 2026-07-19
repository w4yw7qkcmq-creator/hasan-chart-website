import dynamic from "next/dynamic";

const AnalysisRequestGate = dynamic(() => import("./AnalysisRequestGate"), {
  ssr: false,
  loading: () => (
    <main className="analysis-request-page">
      <div className="analysis-request-page__bg" aria-hidden="true" />
      <div className="analysis-request-page__inner">
        <div className="analysis-request-state analysis-request-state--loading" role="status">
          <span className="analysis-request-state__icon" aria-hidden="true">
            ⏳
          </span>
          <h1 className="analysis-request-state__title">جاري تحميل صفحة طلب التحليل…</h1>
        </div>
      </div>
    </main>
  ),
});

export default function RequestAnalysisPage() {
  return <AnalysisRequestGate />;
}

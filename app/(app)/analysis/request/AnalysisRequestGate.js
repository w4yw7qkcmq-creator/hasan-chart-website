"use client";
import dynamic from "next/dynamic";
import { useRequireAuth } from "../../../hooks/useRequireAuth";
import AnalysisRequestAuthenticated from "./AnalysisRequestAuthenticated";
const PublicServiceLanding = dynamic(
  () =>
    import("../../../components/public-seo/PublicServiceLanding").then(
      (mod) => mod.default,
    ),
  { ssr: false },
);
export default function AnalysisRequestGate() {
  const { sessionPending, isAuthenticated, shouldShowLogin } = useRequireAuth();
  if (sessionPending) {
    return (
      <main className="analysis-request-page">
        {" "}
        <div className="analysis-request-page__bg" aria-hidden="true" />{" "}
        <div className="analysis-request-page__inner">
          {" "}
          <div
            className="analysis-request-state analysis-request-state--loading"
            role="status"
          >
            {" "}
            <span className="analysis-request-state__icon" aria-hidden="true">
              {" "}
              ⏳{" "}
            </span>{" "}
            <h1 className="analysis-request-state__title">
              جاري التحقق من الجلسة…
            </h1>{" "}
            <p className="analysis-request-state__text">
              {" "}
              نتحقق من حالة تسجيل الدخول قبل فتح نموذج طلب التحليل.{" "}
            </p>{" "}
          </div>{" "}
        </div>{" "}
      </main>
    );
  }
  if (shouldShowLogin || !isAuthenticated) {
    return <PublicServiceLanding pageKey="analysis-request" />;
  }
  return <AnalysisRequestAuthenticated />;
}

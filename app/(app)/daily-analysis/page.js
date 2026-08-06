import { UiPageShell } from "../../components/ui";
import {
  buildBreadcrumbJsonLd,
  buildDailyAnalysisListPageJsonLd,
  buildPublicMetadata,
  serializeJsonLd,
} from "../../../lib/seo";
import { REVALIDATE_DAILY_ANALYSIS_PAGE } from "../../../lib/public-cache-config";
import dynamic from "next/dynamic";
import { Suspense } from "react";
export const revalidate = REVALIDATE_DAILY_ANALYSIS_PAGE;
const DailyAnalysisClient = dynamic(() => import("./DailyAnalysisClient"), {
  ssr: false,
  loading: () => (
    <main
      className="daily-analysis-page min-h-screen px-4 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      {" "}
      <div className="mx-auto max-w-7xl">
        {" "}
        <div className="rounded-[2rem] border admin-panel-border ui-glass-5 p-10 text-center admin-text-muted">
          {" "}
          جاري تحميل التحليلات اليومية...{" "}
        </div>{" "}
      </div>{" "}
    </main>
  ),
});
export const metadata = buildPublicMetadata({
  path: "/daily-analysis",
  title: "التحليلات اليومية | HasaN CharT World",
  description:
    "آخر تحليلات الأسواق اليومية من فريق HasaN CharT World: العملات الرقمية، الفوركس، الذهب والسلع، والأسهم والمؤشرات — مع الاتجاه المتوقع وروابط الأصول.",
  keywords: [
    "التحليلات اليومية",
    "تحليل البيتكوين",
    "تحليل الفوركس",
    "تحليل الذهب",
    "تحليل الأسهم",
    "HasaN CharT World",
  ],
});
const PAGE_BREADCRUMBS = [
  { label: "الرئيسية", href: "/" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
];
const BREADCRUMB_JSON_LD = buildBreadcrumbJsonLd(PAGE_BREADCRUMBS);
const COLLECTION_JSON_LD = buildDailyAnalysisListPageJsonLd({
  path: "/daily-analysis",
  title: "التحليلات اليومية | HasaN CharT World",
  description:
    "مجموعة التحليلات اليومية والأسبوعية لأسواق المال من HasaN CharT World.",
});
export default function DailyAnalysisPage() {
  return (
    <>
      {" "}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(BREADCRUMB_JSON_LD),
        }}
      />{" "}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(COLLECTION_JSON_LD),
        }}
      />{" "}
      <Suspense
        fallback={
          <main
            className="daily-analysis-page min-h-screen px-4 py-10"
            aria-busy="true"
            aria-live="polite"
          >
            {" "}
            <div className="mx-auto max-w-7xl">
              {" "}
              <div className="rounded-[2rem] border admin-panel-border ui-glass-5 p-10 text-center admin-text-muted">
                {" "}
                جاري تحميل التحليلات اليومية...{" "}
              </div>{" "}
            </div>{" "}
          </main>
        }
      >
        {" "}
        <DailyAnalysisClient />{" "}
      </Suspense>{" "}
    </>
  );
}

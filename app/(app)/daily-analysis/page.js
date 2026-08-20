import {
  buildBreadcrumbJsonLd,
  buildDailyAnalysisListPageJsonLd,
  buildPublicMetadata,
  serializeJsonLd,
} from "../../../lib/seo";
import { Suspense } from "react";
import DailyAnalysisClientOnly from "./DailyAnalysisClientOnly";

export const revalidate = 300;

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(BREADCRUMB_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(COLLECTION_JSON_LD) }}
      />
      <Suspense
        fallback={
          <main className="daily-analysis-page min-h-screen px-4 py-10" aria-busy="true" aria-live="polite">
            <div className="mx-auto max-w-7xl">
              <div className="rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center text-slate-300">
                جاري تحميل التحليلات اليومية...
              </div>
            </div>
          </main>
        }
      >
        <DailyAnalysisClientOnly />
      </Suspense>
    </>
  );
}

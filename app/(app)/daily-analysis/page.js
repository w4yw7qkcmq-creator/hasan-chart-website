import {
  buildBreadcrumbJsonLd,
  buildDailyAnalysisListPageJsonLd,
  buildPublicMetadata,
  serializeJsonLd,
} from "../../../lib/seo";
import { getPublicDailyAnalyses } from "../../../lib/daily-analysis/get-public-daily-analyses";
import DailyAnalysisClient from "./DailyAnalysisClient";

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
  description: "مجموعة التحليلات اليومية والأسبوعية لأسواق المال من HasaN CharT World.",
});

export default async function DailyAnalysisPage() {
  let initialAnalyses = [];
  let initialLoadError = "";

  try {
    const result = await getPublicDailyAnalyses();
    initialAnalyses = Array.isArray(result?.analyses) ? result.analyses : [];
  } catch (error) {
    console.error("[daily-analysis] SSR load failed:", error);
    initialLoadError = error?.message || "تعذر تحميل التحليلات.";
  }

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
      <DailyAnalysisClient initialAnalyses={initialAnalyses} initialLoadError={initialLoadError} />
    </>
  );
}

import {
  buildBreadcrumbJsonLd,
  buildNewsListPageJsonLd,
  buildPublicMetadata,
  serializeJsonLd,
} from "../../../lib/seo";
import { Suspense } from "react";
import NewsListClientOnly from "./NewsListClientOnly";

export const revalidate = 120;

export const metadata = buildPublicMetadata({
  path: "/news",
  title: "الأخبار الاقتصادية العاجلة | HasaN CharT World",
  description:
    "تابع آخر الأخبار الاقتصادية والمالية: العملات الرقمية، الفوركس، الذهب، النفط، الأسهم والمؤشرات، والاقتصاد الأمريكي — تحديث مباشر من HasaN CharT World.",
  keywords: [
    "أخبار اقتصادية",
    "أخبار الفوركس",
    "أخبار الكريبتو",
    "أخبار الذهب",
    "أخبار النفط",
    "أخبار الأسهم",
    "أخبار عاجلة",
    "HasaN CharT World",
  ],
});

const NEWS_BREADCRUMBS = [
  { label: "الرئيسية", href: "/" },
  { label: "الأخبار", href: "/news" },
];

const NEWS_BREADCRUMB_JSON_LD = buildBreadcrumbJsonLd(NEWS_BREADCRUMBS);

const NEWS_LIST_JSON_LD = buildNewsListPageJsonLd({
  path: "/news",
  title: "الأخبار الاقتصادية العاجلة | HasaN CharT World",
  description:
    "قائمة الأخبار الاقتصادية والمالية المحدثة لحظياً: كريبتو، فوركس، ذهب، نفط، أسهم، واقتصاد أمريكي.",
});

export default function NewsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(NEWS_BREADCRUMB_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(NEWS_LIST_JSON_LD) }}
      />
      <Suspense
        fallback={
          <main className="news-list-page min-h-screen px-4 py-10" aria-busy="true" aria-live="polite">
            <div className="mx-auto max-w-7xl">
              <div className="news-list-skeleton rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center text-slate-300">
                جاري تحميل الأخبار...
              </div>
            </div>
          </main>
        }
      >
        <NewsListClientOnly />
      </Suspense>
    </>
  );
}

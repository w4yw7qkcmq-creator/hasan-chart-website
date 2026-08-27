import {
  buildBreadcrumbJsonLd,
  buildNewsListPageJsonLd,
  buildPublicMetadata,
  serializeJsonLd,
} from "../../../lib/seo";
import { NEWS_SSR_INITIAL_SIZE } from "../../../lib/public-cache-config";
import { getCachedNewsList } from "../../../lib/server-news-cache";
import NewsListClient from "./NewsListClient";

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

export default async function NewsPage() {
  const initialResult = await getCachedNewsList({ limit: NEWS_SSR_INITIAL_SIZE });
  const initialNews = initialResult?.items || [];

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
      <NewsListClient initialNews={initialNews} />
    </>
  );
}

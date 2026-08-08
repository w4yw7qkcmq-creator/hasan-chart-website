import ContentPostCard from "../../components/content-posts/ContentPostCard";
import ContentPostsEmptyState from "../../components/content-posts/ContentPostsEmptyState";
import ContentPostsHero from "../../components/content-posts/ContentPostsHero";
import "../../components/content-posts/content-posts.css";
import {
  buildBreadcrumbJsonLd,
  buildPublicMetadata,
  serializeJsonLd,
} from "../../../lib/seo";
import { REVALIDATE_CONTENT_POSTS_PAGE } from "../../../lib/public-cache-config";
import { fetchPublishedContentPosts } from "../../../lib/content-posts";

export const revalidate = REVALIDATE_CONTENT_POSTS_PAGE;

export const metadata = buildPublicMetadata({
  path: "/results",
  title: "HasaN CharT Result | HasaN CharT World",
  description:
    "HasaN CharT Result — عرض النتائج والمنشورات التي ينشرها فريق HasaN CharT World يدوياً من لوحة الإدارة.",
  keywords: ["HasaN CharT Result", "نتائج", "Performance", "Target Hit", "HasaN CharT World"],
});

const BREADCRUMBS = [
  { label: "الرئيسية", href: "/" },
  { label: "HasaN CharT Result", href: "/results" },
];

export default async function ResultsPage() {
  const posts = await fetchPublishedContentPosts("result").catch(() => []);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildBreadcrumbJsonLd(BREADCRUMBS)) }}
      />
      <main className="content-posts-page min-h-screen px-4 py-10" dir="rtl">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <ContentPostsHero
            eyebrow="HasaN CharT Result"
            badge="🏆 نتائج وإنجازات يدوية"
            title="HasaN CharT Result"
            subtitle="عرض احترافي للنتائج والأداء الذي ينشره فريق HasaN CharT World — مع تمييز اختياري للقيمة أو الإنجاز مثل +12%."
          />
          {posts.length === 0 ? (
            <ContentPostsEmptyState
              title="لا توجد نتائج منشورة بعد"
              description="سيتم عرض النتائج هنا فور نشرها من لوحة الإدارة."
            />
          ) : (
            <div className="content-posts-grid content-posts-grid--result">
              {posts.map((post) => (
                <ContentPostCard key={post.id} post={post} variant="result" />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

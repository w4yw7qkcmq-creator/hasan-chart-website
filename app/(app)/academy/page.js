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
  path: "/academy",
  title: "HasaN CharT Academy | HasaN CharT World",
  description:
    "HasaN CharT Academy — دروس ومحتوى تعليمي يدوي من فريق HasaN CharT World في التحليل الكلاسيكي، SMC، الموجي، الزمني، وإدارة المخاطر.",
  keywords: ["HasaN CharT Academy", "أكاديمية", "تعلم التداول", "SMC", "التحليل الموجي", "HasaN CharT World"],
});

const BREADCRUMBS = [
  { label: "الرئيسية", href: "/" },
  { label: "HasaN CharT Academy", href: "/academy" },
];

export default async function AcademyPage() {
  const posts = await fetchPublishedContentPosts("academy").catch(() => []);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildBreadcrumbJsonLd(BREADCRUMBS)) }}
      />
      <main className="content-posts-page min-h-screen px-4 py-10" dir="rtl">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <ContentPostsHero
            eyebrow="HasaN CharT Academy"
            title="HasaN CharT Academy"
            subtitle="دروس ومحتوى تعليمي يُدار يدوياً من الإدارة — بدون AI وبدون نشر تلقائي."
          />
          {posts.length === 0 ? (
            <ContentPostsEmptyState
              title="لا توجد دروس منشورة بعد"
              description="سيتم عرض الدروس هنا فور نشرها من لوحة الإدارة."
            />
          ) : (
            <div className="content-posts-grid content-posts-grid--academy">
              {posts.map((post) => (
                <ContentPostCard key={post.id} post={post} variant="academy" />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

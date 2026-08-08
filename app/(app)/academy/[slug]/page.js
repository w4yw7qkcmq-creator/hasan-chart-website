import { notFound } from "next/navigation";
import ContentPostDetail from "../../../components/content-posts/ContentPostDetail";
import "../../../components/content-posts/content-posts.css";
import {
  buildArticleMetadata,
  buildBreadcrumbJsonLd,
  buildContentPostArticleJsonLd,
  serializeJsonLd,
} from "../../../../lib/seo";
import { REVALIDATE_CONTENT_POSTS_PAGE } from "../../../../lib/public-cache-config";
import { fetchPublishedContentPostBySlug } from "../../../../lib/content-posts";

export const revalidate = REVALIDATE_CONTENT_POSTS_PAGE;

export async function generateMetadata({ params }) {
  const resolved = await params;
  const post = await fetchPublishedContentPostBySlug("academy", resolved.slug).catch(() => null);
  if (!post) {
    return { title: "الدرس غير موجود | HasaN CharT World" };
  }

  return buildArticleMetadata({
    path: `/academy/${post.slug}`,
    title: post.title,
    description: post.summary || post.body.slice(0, 160),
    image: post.image_url,
    publishedTime: post.published_at,
    modifiedTime: post.updated_at,
    section: "HasaN CharT Academy",
    tags: [post.category, "HasaN CharT Academy", "تعليم التداول"].filter(Boolean),
  });
}

export default async function AcademyDetailPage({ params }) {
  const resolved = await params;
  const post = await fetchPublishedContentPostBySlug("academy", resolved.slug).catch(() => null);
  if (!post) notFound();

  const breadcrumbs = [
    { label: "الرئيسية", href: "/" },
    { label: "HasaN CharT Academy", href: "/academy" },
    { label: post.title, href: `/academy/${post.slug}` },
  ];

  const articleJsonLd = buildContentPostArticleJsonLd({
    path: `/academy/${post.slug}`,
    title: post.title,
    description: post.summary || post.body.slice(0, 180),
    content: post.body,
    image: post.image_url,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    articleSection: "HasaN CharT Academy",
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildBreadcrumbJsonLd(breadcrumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }}
      />
      <main className="content-posts-page min-h-screen px-4 py-10" dir="rtl">
        <div className="mx-auto max-w-5xl">
          <ContentPostDetail
            post={post}
            variant="academy"
            breadcrumbs={breadcrumbs}
            backHref="/academy"
            backLabel="← العودة للأكاديمية"
          />
        </div>
      </main>
    </>
  );
}

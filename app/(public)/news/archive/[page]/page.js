import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumbs from "../../../../components/seo/Breadcrumbs";
import NewsArchiveArticleGrid from "../../../../components/news/NewsArchiveArticleGrid";
import NewsArchivePagination from "../../../../components/news/NewsArchivePagination";
import { getCachedNewsArchivePage } from "../../../../../lib/news-archive-data";
import { REVALIDATE_PUBLIC_NEWS } from "../../../../../lib/public-cache-config";
import { buildPublicMetadata } from "../../../../../lib/seo";

export const revalidate = 120;

function buildArchiveMetadata(page, totalPages) {
  const title =
    page === 1
      ? "الأخبار الاقتصادية العاجلة | HasaN CharT World"
      : `أرشيف الأخبار — صفحة ${page} | HasaN CharT World`;

  return buildPublicMetadata({
    path: page === 1 ? "/news" : `/news/archive/${page}`,
    title,
    description:
      page === 1
        ? "تابع آخر الأخبار الاقتصادية والمالية: العملات الرقمية، الفوركس، الذهب، النفط، الأسهم والمؤشرات."
        : `تصفح أرشيف الأخبار الاقتصادية — صفحة ${page} من ${totalPages || page} على HasaN CharT World.`,
    keywords: ["أرشيف الأخبار", "أخبار اقتصادية", "HasaN CharT World"],
  });
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const page = Number.parseInt(String(resolvedParams?.page || ""), 10);

  if (!Number.isFinite(page) || page < 2) {
    return buildPublicMetadata({
      path: "/news",
      title: "أرشيف الأخبار | HasaN CharT World",
      description: "أرشيف الأخبار الاقتصادية على HasaN CharT World.",
    });
  }

  const archive = await getCachedNewsArchivePage(page);
  return buildArchiveMetadata(page, archive?.totalPages || 0);
}

export default async function NewsArchivePage({ params }) {
  const resolvedParams = await params;
  const page = Number.parseInt(String(resolvedParams?.page || ""), 10);

  if (page === 1) {
    permanentRedirect("/news");
  }

  if (!Number.isFinite(page) || page < 2) {
    notFound();
  }

  const archive = await getCachedNewsArchivePage(page);

  if (!archive || archive.totalPages === 0 || page > archive.totalPages) {
    notFound();
  }

  const breadcrumbs = [
    { label: "الرئيسية", href: "/" },
    { label: "الأخبار", href: "/news" },
    { label: `الأرشيف — صفحة ${page}`, href: `/news/archive/${page}` },
  ];

  return (
    <main className="min-h-screen px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>

        <header className="mb-10 overflow-hidden rounded-[2rem] border border-white/40 bg-white/55 p-8 text-center shadow-[0_20px_80px_rgba(14,165,233,0.12)] backdrop-blur-xl md:p-12">
          <span className="mb-4 inline-flex rounded-full border border-cyan-300/40 bg-cyan-100/70 px-5 py-2 text-sm font-black text-cyan-800">
            أرشيف الأخبار
          </span>
          <h1 className="mb-4 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
            الأخبار الاقتصادية — صفحة {page}
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-600">
            تصفح الأرشيف الكامل للأخبار الاقتصادية والمالية المنشورة على HasaN CharT World.
          </p>
          <div className="mt-6">
            <Link
              href="/news"
              className="inline-flex rounded-2xl border border-cyan-300/50 bg-white/80 px-5 py-3 text-sm font-black text-cyan-800 no-underline shadow-lg transition hover:bg-cyan-600 hover:!text-white"
            >
              العودة إلى آخر الأخبار
            </Link>
          </div>
        </header>

        <NewsArchiveArticleGrid items={archive.items} />
        <NewsArchivePagination page={archive.page} totalPages={archive.totalPages} />
      </div>
    </main>
  );
}

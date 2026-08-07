import Link from "next/link";
import ContentPostCard from "../../../components/content-posts/ContentPostCard";
import ContentPostDetail from "../../../components/content-posts/ContentPostDetail";
import { buildContentImagePublicUrl } from "../../../../lib/content-image-url";

export default function ContentPostPreviewModal({
  open,
  onClose,
  post,
  variant = "academy",
  listHref,
}) {
  if (!open || !post) return null;

  const previewPost = {
    ...post,
    image_url: post.image_url || buildContentImagePublicUrl(post.image_path),
    published_at: post.published_at || new Date().toISOString(),
  };

  const breadcrumbs = [
    { label: "الرئيسية", href: "/" },
    {
      label: variant === "result" ? "HasaN CharT Result" : "HasaN CharT Academy",
      href: listHref,
    },
    { label: previewPost.title, href: listHref },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/70 p-4 md:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-[2rem] border border-cyan-300/20 bg-slate-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-cyan-300">معاينة قبل النشر</p>
            <p className="text-xs text-slate-400">هذه المعاينة داخل لوحة الإدارة فقط — المسودات غير عامة.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-black text-white"
          >
            إغلاق
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="text-lg font-black text-white">بطاقة القائمة</h3>
            <ContentPostCard post={previewPost} variant={variant} />
          </section>
          <section className="space-y-3">
            <h3 className="text-lg font-black text-white">صفحة التفاصيل</h3>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
              <ContentPostDetail
                post={previewPost}
                variant={variant}
                breadcrumbs={breadcrumbs}
                backHref={listHref}
                backLabel={variant === "result" ? "← العودة للنتائج" : "← العودة للأكاديمية"}
              />
            </div>
          </section>
        </div>

        <div className="mt-5 flex justify-end">
          <Link href={listHref} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-cyan-300 no-underline">
            فتح الصفحة العامة ↗
          </Link>
        </div>
      </div>
    </div>
  );
}

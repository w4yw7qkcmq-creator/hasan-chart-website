import Link from "next/link";
import { formatContentPostDate, getContentPostPublicPath } from "../../../lib/content-post-public";

export default function ContentPostCard({ post, variant = "academy" }) {
  if (!post) return null;

  const href = getContentPostPublicPath(post.content_type, post.slug);
  const isResult = variant === "result";

  return (
    <Link href={href} className="content-post-card">
      <div className={`content-post-card__media content-post-card__media--${variant}`}>
        {post.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.image_url} alt={post.title} className="content-post-card__image" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl opacity-40" aria-hidden="true">
            {isResult ? "🏆" : "🎓"}
          </div>
        )}
        {post.category ? <span className="content-post-card__badge">{post.category}</span> : null}
        {isResult && post.highlight_value ? (
          <span className="content-post-card__highlight">{post.highlight_value}</span>
        ) : null}
      </div>
      <div className="content-post-card__body">
        {post.category && !isResult ? <span className="content-post-card__category">{post.category}</span> : null}
        <h2 className="content-post-card__title">{post.title}</h2>
        {post.summary ? <p className="content-post-card__summary">{post.summary}</p> : null}
        <div className="content-post-card__meta">
          <span>{formatContentPostDate(post.published_at || post.created_at)}</span>
          <span>{isResult ? "عرض النتيجة ←" : "فتح الدرس ←"}</span>
        </div>
      </div>
    </Link>
  );
}

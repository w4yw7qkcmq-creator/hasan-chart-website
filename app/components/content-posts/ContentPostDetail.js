import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
import { formatContentPostDate } from "../../../lib/content-post-public";

export default function ContentPostDetail({
  post,
  variant = "academy",
  breadcrumbs = [],
  backHref,
  backLabel,
}) {
  if (!post) return null;

  const isResult = variant === "result";

  return (
    <article className="content-post-detail space-y-6">
      <Breadcrumbs items={breadcrumbs} variant="dark" />
      <div className="space-y-4">
        <div className="content-post-detail__meta">
          {post.category ? (
            <span className="content-post-detail__category">{post.category}</span>
          ) : null}
          {isResult && post.highlight_value ? (
            <span className="content-post-detail__highlight">{post.highlight_value}</span>
          ) : null}
          <time className="content-post-detail__date">
            {formatContentPostDate(post.published_at || post.created_at)}
          </time>
        </div>
        <h1 className="content-post-detail__title">{post.title}</h1>
        {post.summary ? <p className="content-post-detail__summary">{post.summary}</p> : null}
      </div>

      {post.image_url ? (
        <div className={`content-post-detail__hero content-post-detail__hero--${variant}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image_url} alt={post.title} />
        </div>
      ) : null}

      <div className="content-post-detail__prose">{post.body}</div>

      {backHref ? (
        <Link href={backHref} className="content-post-detail__back">
          {backLabel}
        </Link>
      ) : null}
    </article>
  );
}

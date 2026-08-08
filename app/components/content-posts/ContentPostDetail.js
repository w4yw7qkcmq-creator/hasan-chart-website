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
        <div className="flex flex-wrap items-center gap-3">
          {post.category ? (
            <span className="rounded-full bg-cyan-400/15 px-3 py-1 text-xs font-black text-cyan-200">
              {post.category}
            </span>
          ) : null}
          {isResult && post.highlight_value ? (
            <span className="rounded-full bg-emerald-500 px-3 py-1 text-sm font-black text-white">
              {post.highlight_value}
            </span>
          ) : null}
          <time className="text-sm font-bold text-slate-400">
            {formatContentPostDate(post.published_at || post.created_at)}
          </time>
        </div>
        <h1 className="text-3xl font-black leading-tight md:text-4xl">{post.title}</h1>
        {post.summary ? <p className="max-w-3xl text-lg leading-8 text-slate-300">{post.summary}</p> : null}
      </div>

      {post.image_url ? (
        <div className={`content-post-detail__hero content-post-detail__hero--${variant}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image_url} alt={post.title} />
        </div>
      ) : null}

      <div className="content-post-detail__prose">{post.body}</div>

      {backHref ? (
        <Link href={backHref} className="inline-flex rounded-2xl border border-cyan-300/20 px-5 py-3 text-sm font-black text-cyan-200 no-underline">
          {backLabel}
        </Link>
      ) : null}
    </article>
  );
}

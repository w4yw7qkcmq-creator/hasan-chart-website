export default function ContentPostsEmptyState({ title, description }) {
  return (
    <div className="content-posts-empty">
      <p className="text-xl font-black text-slate-100">{title}</p>
      <p className="mt-2 text-sm leading-7">{description}</p>
    </div>
  );
}

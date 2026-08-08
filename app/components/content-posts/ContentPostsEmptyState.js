export default function ContentPostsEmptyState({ title, description }) {
  return (
    <div className="content-posts-empty">
      <p className="content-posts-empty__title">{title}</p>
      <p className="content-posts-empty__description">{description}</p>
    </div>
  );
}

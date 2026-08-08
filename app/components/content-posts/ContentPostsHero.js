export default function ContentPostsHero({ eyebrow, title, subtitle, badge }) {
  return (
    <header className="content-posts-hero">
      {badge ? <div className="content-posts-hero__badge">{badge}</div> : null}
      {eyebrow ? <p className="content-posts-hero__eyebrow">{eyebrow}</p> : null}
      <h1 className="content-posts-hero__title">{title}</h1>
      {subtitle ? <p className="content-posts-hero__subtitle">{subtitle}</p> : null}
    </header>
  );
}

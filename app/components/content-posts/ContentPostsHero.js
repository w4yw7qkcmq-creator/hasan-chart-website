export default function ContentPostsHero({ eyebrow, title, subtitle }) {
  return (
    <header className="content-posts-hero">
      {eyebrow ? (
        <p className="mb-2 text-sm font-black tracking-wide text-cyan-300">{eyebrow}</p>
      ) : null}
      <h1 className="text-3xl font-black leading-tight md:text-4xl">{title}</h1>
      {subtitle ? <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">{subtitle}</p> : null}
    </header>
  );
}

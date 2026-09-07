import Link from "next/link";
import { getCanonicalNewsPath } from "../../../lib/news-urls";
import { resolveNewsImageUrl } from "../../../lib/news-images";
import { NewsCoverImage } from "./NewsCoverImage";
import { extractArabicTitle } from "./newsListFormatting";

function shortText(text, max = 260) {
  const value = String(text || "").trim();
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max).trim()}…`;
}

function getSourceName(sourceLink) {
  if (!sourceLink) {
    return "HasaN CharT News";
  }

  try {
    const hostname = new URL(sourceLink).hostname.replace(/^www\./, "");
    return hostname || "HasaN CharT News";
  } catch {
    return "HasaN CharT News";
  }
}

export default function NewsArchiveArticleGrid({ items = [] }) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-white/40 bg-white/70 p-10 text-center text-slate-500 shadow-xl backdrop-blur-xl">
        لا توجد أخبار في هذه الصفحة.
      </div>
    );
  }

  return (
    <div className="grid auto-rows-fr gap-6 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => {
        const newsImpact = item.impact_level || "MEDIUM";
        const isHighImpact = newsImpact === "HIGH";
        const impactColor = isHighImpact
          ? "bg-red-500/15 text-red-300 border-red-400/30"
          : "bg-amber-500/15 text-amber-300 border-amber-400/30";
        const newsTitle = extractArabicTitle(item);
        const newsContent = shortText(item.content || item.title, 260);
        const newsImage = resolveNewsImageUrl(item);
        const sourceName = getSourceName(item.source_link);

        return (
          <Link
            key={item.id}
            href={getCanonicalNewsPath(item)}
            className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-white/50 bg-white/85 text-slate-950 no-underline shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-[0_24px_90px_rgba(14,165,233,0.20)]"
          >
            <div className="relative h-56 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950">
              <NewsCoverImage
                src={newsImage}
                alt={newsTitle || "صورة الخبر"}
                title={newsTitle}
                category="economy"
                item={item}
                priority={index < 3}
              />
              <div className="absolute inset-0 z-20 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
              <div className="absolute left-4 top-4 z-30 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 backdrop-blur">
                {sourceName}
              </div>
              <div
                className={`absolute right-4 top-4 z-30 rounded-full border px-3 py-1 text-xs font-black backdrop-blur ${impactColor}`}
              >
                {isHighImpact ? "🔴 عاجل" : "🟡 مهم"}
              </div>
            </div>

            <div className="flex flex-1 flex-col p-6">
              <div className="mb-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {new Date(item.created_at).toLocaleString("ar-SA", {
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                })}
              </div>

              <h2 className="mb-4 line-clamp-3 min-h-[5.25rem] text-xl font-black leading-relaxed text-slate-950">
                {newsTitle}
              </h2>

              <p className="line-clamp-4 text-[15px] leading-7 text-slate-600">{newsContent}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

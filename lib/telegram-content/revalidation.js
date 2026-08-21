import { invalidateReadCache } from "../server-read-cache.js";

const SECTION_CACHE_KEYS = Object.freeze({
  daily_analysis: ["public:telegram-section-feed:daily_analysis", "public:daily-analysis"],
  academy: ["public:telegram-section-feed:academy"],
  result: ["public:telegram-section-feed:result"],
});

function collectPathsToRevalidate(section, { publicSlug = null } = {}) {
  const paths = new Set(["/content-sitemap.xml"]);

  if (section === "daily_analysis") {
    paths.add("/daily-analysis");
  }
  if (section === "academy") {
    paths.add("/academy");
    if (publicSlug) paths.add(`/academy/${publicSlug}`);
  }
  if (section === "result") {
    paths.add("/results");
    if (publicSlug) paths.add(`/results/${publicSlug}`);
  }

  return paths;
}

function revalidateNextPaths(paths) {
  void import("next/cache")
    .then(({ revalidatePath }) => {
      for (const path of paths) {
        revalidatePath(path);
      }
    })
    .catch(() => {
      // No-op outside Next.js runtime (unit tests, scripts).
    });
}

export function revalidateTelegramSectionContent(section, { publicSlug = null } = {}) {
  const keys = SECTION_CACHE_KEYS[section] || [`public:telegram-section-feed:${section}`];
  for (const key of keys) {
    invalidateReadCache(key);
  }

  const revalidatedPaths = [...collectPathsToRevalidate(section, { publicSlug })];
  revalidateNextPaths(revalidatedPaths);

  return {
    section,
    publicSlug,
    invalidatedKeys: keys,
    revalidatedPaths,
  };
}

/** Max Telegram rows fetched per section for public display (not retention). */
export const TELEGRAM_PUBLIC_DISPLAY_LIMIT = 50;

/** Max manual rows fetched per section for merge (existing pages used ~50). */
export const MANUAL_PUBLIC_DISPLAY_LIMIT = 50;

/** Max merged feed items returned after sort (safety cap). */
export const MERGED_FEED_DISPLAY_CAP = 100;

/** In-memory read cache TTL for section feeds (ms). */
export const TELEGRAM_SECTION_FEED_CACHE_MS = 30_000;

export const TELEGRAM_PUBLIC_SECTIONS = Object.freeze({
  daily_analysis: "daily_analysis",
  academy: "academy",
  result: "result",
});

export function sectionFeedCacheKey(section) {
  return `public:telegram-section-feed:${section}`;
}

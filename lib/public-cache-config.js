export const REVALIDATE_STATIC_MARKETING = 3600;
export const REVALIDATE_PUBLIC_NEWS = 120;
export const REVALIDATE_DAILY_ANALYSIS_PAGE = 300;
export const REVALIDATE_CONTENT_POSTS_PAGE = 300;
export const REVALIDATE_ASSET_HUB = 300;
export const REVALIDATE_HOME_PAGE = REVALIDATE_STATIC_MARKETING;

export const NEWS_POSTS_CACHE_SECONDS = 120;
export const NEWS_ARTICLE_CACHE_SECONDS = 120;
export const NEWS_API_CACHE_MS = 45_000;
export const NEWS_LIST_PAGE_SIZE = 20;
export const NEWS_LIST_MAX_PAGE_SIZE = 50;
export const NEWS_RELATED_LIST_LIMIT = 12;
export const NEWS_CATEGORY_LIST_LIMIT = 50;
export const NEWS_TAG_LIST_LIMIT = 50;
/** @deprecated Replaced by bounded DB list queries */
export const NEWS_RELATED_POOL_LIMIT = NEWS_RELATED_LIST_LIMIT;
/** @deprecated Replaced by bounded DB list queries */
export const NEWS_CATEGORY_POOL_LIMIT = NEWS_CATEGORY_LIST_LIMIT;
export const DAILY_ANALYSIS_API_CACHE_MS = 30_000;

/** CDN / browser hint for public news HTML pages. */
export const CACHE_PUBLIC_NEWS_PAGE =
  "public, max-age=30, s-maxage=120, stale-while-revalidate=300";

/** CDN hint for public SEO artifacts (sitemap, robots, static public assets). */
export const CACHE_PUBLIC_SEO_ARTIFACT =
  "public, s-maxage=3600, stale-while-revalidate=86400";

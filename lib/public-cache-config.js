export const REVALIDATE_STATIC_MARKETING = 3600;
export const REVALIDATE_PUBLIC_NEWS = 120;
export const REVALIDATE_DAILY_ANALYSIS_PAGE = 300;
export const REVALIDATE_ASSET_HUB = 300;
export const REVALIDATE_HOME_PAGE = REVALIDATE_STATIC_MARKETING;

export const NEWS_POSTS_CACHE_SECONDS = 120;
export const NEWS_ARTICLE_CACHE_SECONDS = 120;
export const DAILY_ANALYSIS_API_CACHE_MS = 30_000;

/** CDN hint for public SEO artifacts (sitemap, robots, static public assets). */
export const CACHE_PUBLIC_SEO_ARTIFACT =
  "public, s-maxage=3600, stale-while-revalidate=86400";

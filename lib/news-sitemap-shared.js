import { getCanonicalNewsPath, getCanonicalNewsSegment } from "./news-urls.js";
import { buildAbsoluteUrl } from "./seo.js";

export const LATEST_NEWS_SITEMAP_LIMIT = 1000;
export const SITEMAP_MAX_URLS_PER_FILE = 50000;

const FULL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function escapeSitemapXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toSitemapIsoDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

/** True when the canonical segment is a legacy UUID id (redirect-prone in sitemap). */
export function isLegacyUuidCanonicalSegment(segment) {
  return FULL_UUID_RE.test(String(segment || "").trim());
}

/**
 * Whether a news row should appear in any news sitemap (latest or archive).
 * Canonical slug paths only — no legacy UUID URLs.
 */
export function isNewsPostSitemapEligible(item) {
  if (!item?.created_at) {
    return false;
  }

  const path = getCanonicalNewsPath(item);
  if (path === "/news") {
    return false;
  }

  const segment = getCanonicalNewsSegment(item);
  if (isLegacyUuidCanonicalSegment(segment)) {
    return false;
  }

  return true;
}

export function buildNewsSitemapUrlEntry({ path, lastModified, changefreq = "weekly", priority = "0.7" }) {
  const lastmod = toSitemapIsoDate(lastModified);
  if (!path || !lastmod) {
    return null;
  }

  return `
  <url>
    <loc>${escapeSitemapXml(buildAbsoluteUrl(path))}</loc>
    <lastmod>${escapeSitemapXml(lastmod)}</lastmod>
    <changefreq>${escapeSitemapXml(changefreq)}</changefreq>
    <priority>${escapeSitemapXml(priority)}</priority>
  </url>`;
}

export function buildSitemapIndexEntry(loc, lastmod) {
  const iso = toSitemapIsoDate(lastmod);
  if (!loc || !iso) {
    return null;
  }

  return `
  <sitemap>
    <loc>${escapeSitemapXml(loc)}</loc>
    <lastmod>${escapeSitemapXml(iso)}</lastmod>
  </sitemap>`;
}

export function buildUrlsetXml(urlEntries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.filter(Boolean).join("")}
</urlset>`;
}

export function buildSitemapIndexXml(sitemapEntries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.filter(Boolean).join("")}
</sitemapindex>`;
}

export function getNewsArchiveMonthKey(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** UTC [start, endExclusive) bounds for archive month partitioning. */
export function getUtcMonthBounds(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));

  return {
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
  };
}

export function sortArchiveSitemapEntries(entries) {
  return [...(entries || [])].sort((a, b) => {
    const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return String(b.id).localeCompare(String(a.id));
  });
}

/** Filter eligible archive rows for one month bucket, excluding the latest sitemap ID set. */
export function filterArchiveMonthPosts(posts, latestPostIds) {
  const latestIds = latestPostIds instanceof Set ? latestPostIds : new Set(latestPostIds || []);
  const entries = [];

  for (const item of posts || []) {
    if (!isNewsPostSitemapEligible(item)) {
      continue;
    }

    if (latestIds.has(item.id)) {
      continue;
    }

    entries.push({
      path: getCanonicalNewsPath(item),
      created_at: item.created_at,
      id: item.id,
    });
  }

  return sortArchiveSitemapEntries(entries);
}

export function parseArchiveMonthFile(monthFile) {
  const match = String(monthFile || "").trim().match(/^(\d{4})-(\d{2})\.xml$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  return `${match[1]}-${match[2]}`;
}

export function getArchiveSitemapChildUrl(monthKey) {
  return buildAbsoluteUrl(`/news-sitemaps/${monthKey}.xml`);
}

export function partitionArchiveNewsPosts(posts, latestPostIds) {
  const latestIds = latestPostIds instanceof Set ? latestPostIds : new Set(latestPostIds || []);
  const byMonth = new Map();

  for (const item of posts || []) {
    if (!isNewsPostSitemapEligible(item)) {
      continue;
    }

    if (latestIds.has(item.id)) {
      continue;
    }

    const monthKey = getNewsArchiveMonthKey(item.created_at);
    if (!monthKey) {
      continue;
    }

    const path = getCanonicalNewsPath(item);
    const bucket = byMonth.get(monthKey) || [];
    bucket.push({
      path,
      created_at: item.created_at,
      id: item.id,
    });
    byMonth.set(monthKey, bucket);
  }

  for (const [monthKey, entries] of byMonth.entries()) {
    byMonth.set(monthKey, sortArchiveSitemapEntries(entries));
  }

  return byMonth;
}

export function parseArchivePageNumber(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

export function buildArchivePageHref(page) {
  if (page <= 1) {
    return "/news";
  }
  return `/news/archive/${page}`;
}

export function countEligibleSitemapPosts(posts) {
  return (posts || []).filter(isNewsPostSitemapEligible).length;
}

export const SITEMAP_XML_HEADERS = {
  "Content-Type": "application/xml",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

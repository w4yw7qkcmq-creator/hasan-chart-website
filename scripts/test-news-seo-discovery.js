import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildNewsSitemapUrlEntry,
  buildSitemapIndexXml,
  buildUrlsetXml,
  filterArchiveMonthPosts,
  getArchiveSitemapChildUrl,
  getNewsArchiveMonthKey,
  getUtcMonthBounds,
  isLegacyUuidCanonicalSegment,
  isNewsPostSitemapEligible,
  LATEST_NEWS_SITEMAP_LIMIT,
  parseArchiveMonthFile,
  partitionArchiveNewsPosts,
  parseArchivePageNumber,
  buildArchivePageHref,
  countEligibleSitemapPosts,
} from "../lib/news-sitemap-shared.js";
import { getCanonicalNewsPath } from "../lib/news-urls.js";
import { NEWS_ARCHIVE_PAGE_SIZE } from "../lib/public-cache-config.js";

describe("news sitemap eligibility", () => {
  it("includes canonical slug URLs", () => {
    assert.equal(
      isNewsPostSitemapEligible({ id: "abc", slug: "market-news-abc123", created_at: "2026-08-01T00:00:00.000Z" }),
      true
    );
    assert.equal(getCanonicalNewsPath({ id: "abc", slug: "market-news-abc123" }), "/news/market-news-abc123");
  });

  it("includes numeric canonical slugs", () => {
    assert.equal(
      isNewsPostSitemapEligible({ id: "uuid-1", slug: "10", created_at: "2026-08-01T00:00:00.000Z" }),
      true
    );
  });

  it("excludes legacy UUID canonical URLs", () => {
    const uuid = "3098babd-aa1a-4a11-b7ba-70f66770b038";
    assert.equal(isLegacyUuidCanonicalSegment(uuid), true);
    assert.equal(
      isNewsPostSitemapEligible({ id: uuid, slug: "", created_at: "2026-08-01T00:00:00.000Z" }),
      false
    );
  });

  it("excludes rows without created_at", () => {
    assert.equal(isNewsPostSitemapEligible({ id: "1", slug: "x" }), false);
  });
});

describe("archive sitemap partitioning", () => {
  const posts = [
    { id: "1", slug: "new-a", created_at: "2026-09-07T10:00:00.000Z" },
    { id: "2", slug: "new-b", created_at: "2026-09-06T10:00:00.000Z" },
    { id: "3", slug: "old-a", created_at: "2026-06-10T10:00:00.000Z" },
    { id: "4", slug: "old-b", created_at: "2026-06-05T10:00:00.000Z" },
    {
      id: "3098babd-aa1a-4a11-b7ba-70f66770b038",
      slug: "legacy-text-3098babd",
      created_at: "2026-06-01T10:00:00.000Z",
    },
  ];

  it("excludes latest sitemap ids from archive partitions", () => {
    const latestIds = new Set(["1", "2"]);
    const partitions = partitionArchiveNewsPosts(posts, latestIds);
    const allPaths = Array.from(partitions.values()).flat().map((entry) => entry.path);

    assert.deepEqual(allPaths, ["/news/old-a", "/news/old-b", "/news/legacy-text-3098babd"]);
    assert.ok(!allPaths.includes("/news/new-a"));
    assert.ok(!allPaths.includes("/news/new-b"));
  });

  it("partitions by UTC month", () => {
    const partitions = partitionArchiveNewsPosts(posts, new Set(["1", "2"]));
    assert.ok(partitions.has("2026-06"));
    assert.equal(partitions.get("2026-06").length, 3);
  });

  it("builds stable month keys", () => {
    assert.equal(getNewsArchiveMonthKey("2026-06-13T21:25:07.578Z"), "2026-06");
    assert.equal(getNewsArchiveMonthKey("2026-09-07T11:44:45.092Z"), "2026-09");
  });

  it("parses archive month file names", () => {
    assert.equal(parseArchiveMonthFile("2026-06.xml"), "2026-06");
    assert.equal(parseArchiveMonthFile("2026-13.xml"), null);
    assert.equal(parseArchiveMonthFile("bad.xml"), null);
  });

  it("avoids duplicate paths across partitions", () => {
    const partitions = partitionArchiveNewsPosts(posts, new Set(["1"]));
    const paths = Array.from(partitions.values()).flat().map((entry) => entry.path);
    assert.equal(new Set(paths).size, paths.length);
  });

  it("builds UTC month bounds for archive month queries", () => {
    assert.deepEqual(getUtcMonthBounds("2026-06"), {
      start: "2026-06-01T00:00:00.000Z",
      endExclusive: "2026-07-01T00:00:00.000Z",
    });
    assert.equal(getUtcMonthBounds("2026-13"), null);
  });

  it("filters archive month posts with latest exclusion", () => {
    const junePosts = posts.filter((post) => getNewsArchiveMonthKey(post.created_at) === "2026-06");
    const entries = filterArchiveMonthPosts(junePosts, new Set(["1", "2"]));
    assert.deepEqual(
      entries.map((entry) => entry.path),
      ["/news/old-a", "/news/old-b", "/news/legacy-text-3098babd"]
    );
  });
});

describe("sitemap XML builders", () => {
  it("builds valid urlset XML", () => {
    const entry = buildNewsSitemapUrlEntry({
      path: "/news/market-news-abc",
      lastModified: "2026-08-01T00:00:00.000Z",
    });
    const xml = buildUrlsetXml([entry]);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(xml, /https:\/\/www\.hasanchartworld\.com\/news\/market-news-abc/);
  });

  it("builds valid sitemap index XML", () => {
    const xml = buildSitemapIndexXml([
      `<sitemap><loc>${getArchiveSitemapChildUrl("2026-06")}</loc><lastmod>2026-06-30T00:00:00.000Z</lastmod></sitemap>`,
    ]);
    assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(xml, /\/news-sitemaps\/2026-06\.xml/);
  });
});

describe("archive pagination helpers", () => {
  it("parses archive page numbers", () => {
    assert.equal(parseArchivePageNumber("2"), 2);
    assert.equal(parseArchivePageNumber("0"), null);
    assert.equal(parseArchivePageNumber("abc"), null);
  });

  it("builds archive hrefs with page 1 at /news", () => {
    assert.equal(buildArchivePageHref(1), "/news");
    assert.equal(buildArchivePageHref(2), "/news/archive/2");
    assert.equal(buildArchivePageHref(3), "/news/archive/3");
  });

  it("uses 20 posts per archive page", () => {
    assert.equal(NEWS_ARCHIVE_PAGE_SIZE, 20);
  });
});

describe("route wiring", () => {
  it("keeps latest news sitemap route and adds archive routes", () => {
    const latest = readFileSync("app/(public)/news-sitemap.xml/route.js", "utf8");
    const archiveIndex = readFileSync("app/(public)/news-archive-sitemap.xml/route.js", "utf8");
    const archiveChild = readFileSync("app/(public)/news-sitemaps/[monthFile]/route.js", "utf8");
    const archivePage = readFileSync("app/(public)/news/archive/[page]/page.js", "utf8");
    const robots = readFileSync("app/robots.js", "utf8");

    assert.match(latest, /LATEST_NEWS_SITEMAP_LIMIT/);
    assert.match(latest, /isNewsPostSitemapEligible/);
    assert.match(archiveIndex, /getArchiveSitemapIndexPartitions/);
    assert.match(archiveChild, /getArchiveMonthSitemapEntries/);
    assert.match(archivePage, /NewsArchivePagination/);
    assert.match(archivePage, /getCachedNewsArchivePage/);
    assert.match(robots, /news-archive-sitemap\.xml/);
  });

  it("adds crawlable archive nav from /news shell", () => {
    const shell = readFileSync("app/(public)/news/NewsPageShell.js", "utf8");
    const nav = readFileSync("app/components/news/NewsArchiveNavLink.js", "utf8");
    assert.match(shell, /NewsArchiveNavLink/);
    assert.match(nav, /\/news\/archive\/2/);
  });

  it("archive pagination uses real anchor links", () => {
    const pagination = readFileSync("app/components/news/NewsArchivePagination.js", "utf8");
    const grid = readFileSync("app/components/news/NewsArchiveArticleGrid.js", "utf8");
    assert.match(pagination, /<Link/);
    assert.match(pagination, /rel="next"/);
    assert.match(grid, /href=\{getCanonicalNewsPath\(item\)\}/);
  });
});

describe("coverage helpers", () => {
  it("counts eligible sitemap posts", () => {
    const posts = [
      { id: "1", slug: "a", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "3098babd-aa1a-4a11-b7ba-70f66770b038", slug: "", created_at: "2026-01-01T00:00:00.000Z" },
    ];
    assert.equal(countEligibleSitemapPosts(posts), 1);
  });

  it("latest sitemap limit remains 1000", () => {
    assert.equal(LATEST_NEWS_SITEMAP_LIMIT, 1000);
  });
});

describe("existing UUID redirect behavior unchanged", () => {
  it("news article page still uses permanentRedirect for canonical migration", () => {
    const page = readFileSync("app/(public)/news/[id]/page.js", "utf8");
    assert.match(page, /permanentRedirect\(getCanonicalNewsPath\(news\)\)/);
  });
});

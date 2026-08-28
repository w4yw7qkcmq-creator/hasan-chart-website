import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  getCanonicalNewsPath,
  getCanonicalNewsSegment,
  shouldRedirectToCanonicalNewsPath,
} from "../lib/news-urls.js";
import {
  PUBLIC_SITEMAP_PATHS,
  PRIVATE_ROBOTS_PATHS,
  buildNotFoundMetadata,
  buildPrivateMetadata,
  buildSitemapEntries,
} from "../lib/seo.js";

describe("news canonical URL helpers", () => {
  it("prefers slug over id for canonical path", () => {
    const news = { id: 79, slug: "market-news-abc123" };
    assert.equal(getCanonicalNewsPath(news), "/news/market-news-abc123");
    assert.equal(getCanonicalNewsSegment(news), "market-news-abc123");
  });

  it("falls back to id when slug is missing", () => {
    const news = { id: 79, slug: "" };
    assert.equal(getCanonicalNewsPath(news), "/news/79");
  });

  it("redirects numeric URL to slug for the same record only", () => {
    const news = { id: 79, slug: "market-news-abc123" };
    assert.equal(shouldRedirectToCanonicalNewsPath("79", news), true);
    assert.equal(shouldRedirectToCanonicalNewsPath("market-news-abc123", news), false);
  });

  it("does not redirect between different records (id/slug collision safety)", () => {
    const recordA = { id: 20, slug: "article-a" };
    const recordB = { id: 98, slug: "20-98babb" };

    assert.equal(shouldRedirectToCanonicalNewsPath("20", recordA), true);
    assert.equal(getCanonicalNewsPath(recordA), "/news/article-a");
    assert.equal(shouldRedirectToCanonicalNewsPath("20-98babb", recordB), false);
    assert.equal(getCanonicalNewsPath(recordB), "/news/20-98babb");

    assert.notEqual(getCanonicalNewsPath(recordA), getCanonicalNewsPath(recordB));
    assert.notEqual(getCanonicalNewsPath(recordA), "/news/20-98babb");
    assert.notEqual(getCanonicalNewsPath(recordB), "/news/20");
  });

  it("never derives canonical from requested URL shape alone", () => {
    const news = { id: 20, slug: "20-98babb" };
    assert.equal(shouldRedirectToCanonicalNewsPath("20", news), true);
    assert.equal(getCanonicalNewsPath(news), "/news/20-98babb");
  });
});

describe("news sitemap canonical paths", () => {
  it("uses shared helper in news-sitemap route", () => {
    const route = readFileSync("app/(public)/news-sitemap.xml/route.js", "utf8");
    assert.match(route, /getCanonicalNewsPath/);
    assert.doesNotMatch(route, /\/news\/\$\{slug\}/);
  });

  it("dedupes by canonical path for mixed slug/id records", () => {
    const records = [
      { id: 79, slug: "market-news-abc123" },
      { id: 80, slug: "" },
      { id: 98, slug: "20-98babb" },
    ];

    const paths = records.map((record) => getCanonicalNewsPath(record));
    assert.deepEqual(paths, ["/news/market-news-abc123", "/news/80", "/news/20-98babb"]);
    assert.equal(new Set(paths).size, paths.length);
  });
});

describe("gold URL consolidation", () => {
  it("keeps /gold live and redirects only /xau alias to /xauusd", () => {
    const goldPage = readFileSync("app/(public-static)/gold/page.js", "utf8");
    const xauPage = readFileSync("app/(app)/xau/page.js", "utf8");
    assert.match(goldPage, /GoldPageContent/);
    assert.doesNotMatch(goldPage, /permanentRedirect\("\/xauusd"\)/);
    assert.match(xauPage, /permanentRedirect\("\/xauusd"\)/);
  });

  it("includes /gold and /xauusd but not /xau in public sitemap paths", () => {
    assert.ok(PUBLIC_SITEMAP_PATHS.includes("/gold"));
    assert.ok(PUBLIC_SITEMAP_PATHS.includes("/xauusd"));
    assert.ok(!PUBLIC_SITEMAP_PATHS.includes("/xau"));
  });
});

describe("404 and private metadata", () => {
  it("buildNotFoundMetadata is noindex without homepage canonical", () => {
    const metadata = buildNotFoundMetadata();
    assert.equal(metadata.robots.index, false);
    assert.equal(metadata.alternates?.canonical, undefined);
    assert.ok(!metadata.alternates || !("canonical" in metadata.alternates) || !metadata.alternates.canonical);
  });

  it("buildPrivateMetadata does not declare homepage canonical", () => {
    const metadata = buildPrivateMetadata({ title: "Login" });
    assert.equal(metadata.robots.index, false);
    assert.equal(metadata.alternates?.canonical, undefined);
  });

  it("not-found.js exports dedicated metadata", () => {
    const notFound = readFileSync("app/not-found.js", "utf8");
    assert.match(notFound, /buildNotFoundMetadata/);
    assert.match(notFound, /export const metadata/);
  });
});

describe("/news server-first rendering", () => {
  it("fetches initial news on the server page", () => {
    const page = readFileSync("app/(public)/news/page.js", "utf8");
    assert.match(page, /getCachedNewsList/);
    assert.match(page, /initialNews=\{initialNews\}/);
    assert.doesNotMatch(page, /NewsListClientOnly/);
    assert.doesNotMatch(page, /ssr:\s*false/);
  });

  it("NewsListClient accepts initialNews and skips empty-state loading", () => {
    const client = readFileSync("app/(public)/news/NewsListClient.js", "utf8");
    assert.match(client, /initialNews/);
    assert.match(client, /hasInitialNews/);
    assert.match(client, /useState\(\(\) => \(hasInitialNews \? initialNews : \[\]\)\)/);
  });
});

describe("news internal links helper", () => {
  it("newsListFormatting re-exports canonical helper", () => {
    const formatting = readFileSync("app/components/news/newsListFormatting.js", "utf8");
    assert.match(formatting, /getCanonicalNewsPath as getNewsHref/);
  });

  it("article page redirects via permanentRedirect", () => {
    const page = readFileSync("app/(public)/news/[id]/page.js", "utf8");
    assert.match(page, /shouldRedirectToCanonicalNewsPath/);
    assert.match(page, /permanentRedirect\(getCanonicalNewsPath\(news\)\)/);
  });
});

describe("SEO Phase 2A — robots login/register crawl vs noindex", () => {
  it("does not disallow /login or /register in PRIVATE_ROBOTS_PATHS", () => {
    assert.ok(!PRIVATE_ROBOTS_PATHS.includes("/login"));
    assert.ok(!PRIVATE_ROBOTS_PATHS.includes("/register"));
  });

  it("robots route omits login/register from disallow list", () => {
    const robotsModule = readFileSync("app/robots.js", "utf8");
    assert.doesNotMatch(robotsModule, /["']\/login["']/);
    assert.doesNotMatch(robotsModule, /["']\/register["']/);
    assert.match(robotsModule, /PRIVATE_ROBOTS_PATHS/);
  });

  it("login/register private metadata stays noindex", () => {
    const loginLayout = readFileSync("app/(app)/login/layout.js", "utf8");
    const registerLayout = readFileSync("app/(app)/register/layout.js", "utf8");
    assert.match(loginLayout, /buildPrivateMetadata/);
    assert.match(registerLayout, /buildPrivateMetadata/);

    const metadata = buildPrivateMetadata({ title: "Login" });
    assert.equal(metadata.robots.index, false);
    assert.equal(metadata.robots.follow, false);
    assert.equal(metadata.robots.nocache, true);
  });

  it("keeps other private paths disallowed", () => {
    for (const path of ["/admin", "/dashboard", "/api/", "/r/", "/403"]) {
      assert.ok(PRIVATE_ROBOTS_PATHS.includes(path), `expected disallow path ${path}`);
    }
  });
});

describe("SEO Phase 2A — static sitemap lastModified and vip-forex", () => {
  it("omits generation-time lastModified from static sitemap entries", () => {
    const entries = buildSitemapEntries(["/", "/gold", "/news"]);
    assert.ok(entries.length >= 3);
    for (const entry of entries) {
      assert.equal(entry.lastModified, undefined);
      assert.ok(!("lastmod" in entry));
    }
  });

  it("includes /vip-forex and gold/xauusd safety paths", () => {
    assert.ok(PUBLIC_SITEMAP_PATHS.includes("/vip-forex"));
    assert.ok(PUBLIC_SITEMAP_PATHS.includes("/gold"));
    assert.ok(PUBLIC_SITEMAP_PATHS.includes("/xauusd"));
    assert.ok(!PUBLIC_SITEMAP_PATHS.includes("/xau"));
    assert.ok(!PUBLIC_SITEMAP_PATHS.includes("/login"));
    assert.ok(!PUBLIC_SITEMAP_PATHS.includes("/register"));
  });

  it("buildSitemapEntries uses canonical www URLs only", () => {
    const entries = buildSitemapEntries();
    for (const entry of entries) {
      assert.match(entry.url, /^https:\/\/www\.hasanchartworld\.com/);
    }
  });
});

describe("SEO Phase 2A — vip-forex internal links", () => {
  it("subscriptions hub links include VIP Forex for guests", () => {
    const subscriptions = readFileSync("lib/public-seo-content/pages/subscriptions.js", "utf8");
    assert.match(subscriptions, /href: ['"]\/vip-forex['"]/);
  });

  it("forex-signals page links to VIP Forex", () => {
    const forexSignals = readFileSync("lib/public-seo-content/pages/forex-signals.js", "utf8");
    assert.match(forexSignals, /href: ['"]\/vip-forex['"]/);
  });

  it("internal-links related services include vip-forex for forex-signals", () => {
    const links = readFileSync("lib/internal-links.js", "utf8");
    const forexBlockStart = links.indexOf('"forex-signals": [');
    assert.ok(forexBlockStart >= 0);
    const forexBlock = links.slice(forexBlockStart, links.indexOf('"account-management":', forexBlockStart));
    assert.match(forexBlock, /"vip-forex"/);
  });
});

describe("SEO Phase 2C — P1 service landing SSR wrappers", () => {
  const P1_PAGES = [
    {
      route: "/vip-forex",
      page: "app/(app)/vip-forex/page.js",
      client: "app/(app)/vip-forex/VipForexPageClient.js",
      pageKey: "vip-forex",
      gate: "AuthGuestLandingGate",
    },
    {
      route: "/vip-spot",
      page: "app/(app)/vip-spot/page.js",
      client: "app/(app)/vip-spot/VipSpotPageClient.js",
      pageKey: "vip-spot",
      gate: "AuthGuestLandingGate",
    },
    {
      route: "/vip-futures",
      page: "app/(app)/vip-futures/page.js",
      client: "app/(app)/vip-futures/VipFuturesPageClient.js",
      pageKey: "vip-futures",
      gate: "AuthGuestLandingGate",
    },
    {
      route: "/subscriptions",
      page: "app/(app)/subscriptions/page.js",
      client: "app/(app)/subscriptions/SubscriptionsPageClient.js",
      pageKey: "subscriptions",
      gate: "RequireAuthGuestLandingGate",
    },
    {
      route: "/partner-center",
      page: "app/(app)/partner-center/page.js",
      client: "app/(app)/partner-center/PartnerCenterClient.js",
      pageKey: "partner-center",
      gate: "RequireAuthGuestLandingGate",
    },
    {
      route: "/account-management",
      page: "app/(app)/account-management/page.js",
      client: "app/(app)/account-management/AccountManagementClient.js",
      pageKey: "account-management",
      gate: "RequireAuthGuestLandingGate",
    },
  ];

  for (const entry of P1_PAGES) {
    it(`${entry.route} server page uses renderPublicSeoP1Page without ssr:false`, () => {
      const page = readFileSync(entry.page, "utf8");
      assert.doesNotMatch(page, /["']use client["']/);
      assert.match(page, /renderPublicSeoP1Page/);
      assert.match(page, new RegExp(`pageKey: "${entry.pageKey}"`));
      assert.doesNotMatch(page, /ssr:\s*false/);
    });

    it(`${entry.route} client gate uses ${entry.gate} with initialAuthenticated`, () => {
      const client = readFileSync(entry.client, "utf8");
      assert.match(client, new RegExp(entry.gate));
      assert.match(client, /initialAuthenticated/);
      assert.doesNotMatch(client, /PublicServiceLanding.*ssr:\s*false/);
      assert.doesNotMatch(client, /dynamic\([\s\S]*PublicServiceLanding[\s\S]*ssr:\s*false/);
    });
  }

  it("forex-signals remains the known-good server import pattern", () => {
    const page = readFileSync("app/(app)/forex-signals/page.js", "utf8");
    assert.doesNotMatch(page, /["']use client["']/);
    assert.match(page, /PublicServiceLanding/);
    assert.doesNotMatch(page, /ssr:\s*false/);
  });
});

describe("SEO Phase 2C — authenticated flash mitigation", () => {
  it("server auth helper validates session via getOptionalSessionUser only", () => {
    const helper = readFileSync("lib/public-seo-server-auth.js", "utf8");
    assert.match(helper, /getOptionalSessionUser/);
    assert.doesNotMatch(helper, /cookieStore\.get\(/);
    assert.doesNotMatch(helper, /return\s*\{\s*email/);
  });

  it("renderPublicSeoP1Page branches guest landing vs authenticated shell", () => {
    const renderer = readFileSync("lib/render-public-seo-p1-page.js", "utf8");
    assert.match(renderer, /getPublicSeoInitialAuth/);
    assert.match(renderer, /isAuthenticated/);
    assert.match(renderer, /initialAuthenticated/);
    assert.match(renderer, /PublicServiceLanding/);
  });

  it("AuthGuestLandingGate skips landing when initialAuthenticated", () => {
    const gate = readFileSync("app/components/public-seo/GuestPublicLandingGate.js", "utf8");
    assert.match(gate, /initialAuthenticated/);
    assert.match(gate, /authResolved && !user\?\.email/);
  });

  it("RequireAuthGuestLandingGate uses authenticatedPendingFallback not marketing landing", () => {
    const gate = readFileSync("app/components/public-seo/GuestPublicLandingGate.js", "utf8");
    assert.match(gate, /authenticatedPendingFallback/);
  });

  it("subscriptions passes authenticated pending shell for server-authenticated users", () => {
    const client = readFileSync("app/(app)/subscriptions/SubscriptionsPageClient.js", "utf8");
    assert.match(client, /authenticatedPendingFallback/);
    assert.match(client, /SubscriptionsAuthenticatedPendingShell/);
  });
});

console.log("SEO Phase 1 regression tests loaded");

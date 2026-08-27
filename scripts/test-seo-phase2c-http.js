import assert from "node:assert/strict";
import { getPublicSeoPage } from "../lib/public-seo-content/index.js";

const BASE_URL = process.env.SEO_TEST_BASE_URL || "http://127.0.0.1:3000";

const P1_ROUTES = [
  "vip-forex",
  "vip-spot",
  "vip-futures",
  "subscriptions",
  "partner-center",
  "account-management",
];

function countMatches(html, pattern) {
  const matches = html.match(pattern);
  return matches ? matches.length : 0;
}

function extractJsonLdTypes(html) {
  const types = [];
  const blocks = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block.replace(/^<script type="application\/ld\+json">/, "").replace(/<\/script>$/, ""));
      const graph = json["@graph"] || [json];
      for (const node of graph) {
        if (node["@type"]) {
          types.push(node["@type"]);
        }
      }
    } catch {
      // ignore malformed blocks in test output
    }
  }
  return types;
}

async function auditRoute(pageKey) {
  const page = getPublicSeoPage(pageKey);
  const path = page.path;
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": "HasanChartSEOAudit/2C" },
    redirect: "follow",
  });
  const html = await response.text();
  const h1Matches = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || [];
  const h1Texts = h1Matches.map((tag) => tag.replace(/<[^>]+>/g, "").trim());
  const heroPresent = html.includes(page.heroTitle);
  const internalLinks = (html.match(/href="\/[a-z0-9-/]+"/gi) || []).filter(
    (href) => !href.includes('href="/_next') && !href.includes('href="/api')
  );
  const loaderOnly =
    h1Texts.some((text) => text.includes("جاري التحقق") || text.includes("جاري تحميل")) &&
    !heroPresent;
  const jsonLdTypes = extractJsonLdTypes(html);

  return {
    path,
    status: response.status,
    canonical: html.match(/rel="canonical" href="([^"]+)"/)?.[1] || null,
    robots: html.match(/name="robots" content="([^"]+)"/i)?.[1] || null,
    h1Count: h1Matches.length,
    h1Texts,
    heroPresent,
    internalLinkCount: internalLinks.length,
    jsonLdTypes,
    loaderOnly,
    heroTitle: page.heroTitle,
  };
}

async function main() {
  const results = [];
  let failures = 0;

  for (const pageKey of P1_ROUTES) {
    const result = await auditRoute(pageKey);
    results.push(result);

    try {
      assert.equal(result.status, 200, `${result.path} status`);
      assert.ok(result.canonical?.endsWith(result.path), `${result.path} canonical`);
      assert.match(result.robots || "", /index/i, `${result.path} robots index`);
      assert.equal(result.h1Count, 1, `${result.path} single H1`);
      assert.ok(result.heroPresent, `${result.path} hero title in HTML`);
      assert.ok(result.internalLinkCount >= 1, `${result.path} internal links`);
      assert.ok(!result.loaderOnly, `${result.path} not loader-only body`);
      assert.ok(result.jsonLdTypes.includes("WebPage"), `${result.path} WebPage JSON-LD`);
      assert.ok(result.jsonLdTypes.includes("Service"), `${result.path} Service JSON-LD`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${result.path}:`, error.message);
    }
  }

  console.log(JSON.stringify({ baseUrl: BASE_URL, results, failures }, null, 2));

  if (failures > 0) {
    process.exit(1);
  }

  console.log(`SEO Phase 2C HTTP audit PASS (${P1_ROUTES.length} routes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

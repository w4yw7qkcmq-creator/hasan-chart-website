import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PUBLIC_SITEMAP_PATHS } from "../lib/seo.js";

describe("content SEO static", () => {
  it("includes academy and results in public sitemap paths", () => {
    assert.ok(PUBLIC_SITEMAP_PATHS.includes("/academy"));
    assert.ok(PUBLIC_SITEMAP_PATHS.includes("/results"));
  });

  it("has content sitemap route", () => {
    const route = readFileSync("app/(public)/content-sitemap.xml/route.js", "utf8");
    assert.match(route, /\.eq\("status", "published"\)/);
    assert.match(route, /\.is\("deleted_at", null\)/);
  });

  it("robots references content sitemap", () => {
    const robots = readFileSync("app/robots.js", "utf8");
    assert.match(robots, /content-sitemap\.xml/);
  });
});

console.log("content SEO static tests loaded");

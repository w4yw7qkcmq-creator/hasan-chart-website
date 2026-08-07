import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendSlugSuffix,
  slugifyContentPostTitle,
  validateContentPostSlug,
} from "../lib/content-post-slug-core.js";
import { buildFallbackContentPostSlug } from "../lib/content-post-slug.js";

describe("content post slug", () => {
  it("slugifies English titles", () => {
    assert.equal(slugifyContentPostTitle("Hello World Guide"), "hello-world-guide");
  });

  it("slugifies Arabic titles", () => {
    const slug = slugifyContentPostTitle("التحليل الكلاسيكي للمبتدئين");
    assert.match(slug, /[\p{L}\p{N}-]+/u);
    assert.ok(slug.length > 0);
  });

  it("handles symbols-only titles with fallback on validate/resolution path", () => {
    assert.equal(slugifyContentPostTitle("!!!@@@"), "");
    const fallback = buildFallbackContentPostSlug();
    assert.match(fallback, /^post-[a-f0-9]{8}$/);
  });

  it("appends safe suffix for collisions", () => {
    const next = appendSlugSuffix("hello-world", "abc123");
    assert.equal(next, "hello-world-abc123");
  });

  it("validates slug pattern", () => {
    assert.equal(validateContentPostSlug("valid-slug-123").ok, true);
    assert.equal(validateContentPostSlug("bad slug").ok, false);
  });
});

console.log("content post slug tests loaded");

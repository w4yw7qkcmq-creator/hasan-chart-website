#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  getContentPostPublicPath,
  normalizeContentPostSlugParam,
} from "../lib/content-post-public.js";

const arabicSlug = "فقرة-تعليمية-hasan-chart-team";
const encoded = encodeURIComponent(arabicSlug);

assert.equal(normalizeContentPostSlugParam(encoded), arabicSlug);
assert.equal(normalizeContentPostSlugParam(arabicSlug), arabicSlug);
assert.equal(
  getContentPostPublicPath("academy", arabicSlug),
  `/academy/${encoded}`
);
assert.equal(
  getContentPostPublicPath("result", "weekly-result"),
  "/results/weekly-result"
);

console.log("test-content-post-slug-route: PASS");

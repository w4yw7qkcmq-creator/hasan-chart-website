import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const pageSource = read("app/(app)/daily-analysis/page.js");
const clientSource = read("app/(app)/daily-analysis/DailyAnalysisClient.js");
const sharedSource = read("lib/daily-analysis/get-public-daily-analyses.js");
const routeSource = read("app/api/daily-analysis/route.js");

assert.doesNotMatch(pageSource, /DailyAnalysisClientOnly/, "page must not use client-only wrapper");
assert.doesNotMatch(pageSource, /ssr:\s*false/, "page must not disable SSR");
assert.match(pageSource, /getPublicDailyAnalyses/, "page must fetch shared server read-model");
assert.match(pageSource, /initialAnalyses=\{initialAnalyses\}/, "page must pass initial analyses to client");

assert.match(clientSource, /initialAnalyses/, "client must accept initial analyses prop");
assert.match(clientSource, /التحليلات اليومية/, "client must retain existing H1 copy");
assert.doesNotMatch(clientSource, /ssr:\s*false(?![\s\S]*DailyAnalysisAdminForm)/, "client must not disable SSR globally");

assert.match(sharedSource, /withReadCache\("public:daily-analysis"/, "shared helper must preserve read cache key");
assert.match(sharedSource, /mergeFeedItemsByPublishedAt/, "shared helper must preserve feed merge logic");
assert.match(routeSource, /getPublicDailyAnalyses/, "API route must reuse shared helper");

try {
  read("app/(app)/daily-analysis/DailyAnalysisClientOnly.js");
  assert.fail("DailyAnalysisClientOnly.js should be removed");
} catch (error) {
  assert.match(error.message, /ENOENT/, "client-only wrapper file should be deleted");
}

console.log("test-daily-analysis-ssr: PASS");

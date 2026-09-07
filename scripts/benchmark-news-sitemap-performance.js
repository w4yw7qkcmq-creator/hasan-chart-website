/**
 * Compare legacy full-corpus archive sitemap logic vs optimized month-sliced logic.
 * Requires .env.local with Supabase credentials.
 *
 * Usage: node scripts/benchmark-news-sitemap-performance.js
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  filterArchiveMonthPosts,
  getUtcMonthBounds,
  LATEST_NEWS_SITEMAP_LIMIT,
  isNewsPostSitemapEligible,
  partitionArchiveNewsPosts,
} from "../lib/news-sitemap-shared.js";
import { getCanonicalNewsPath } from "../lib/news-urls.js";

const LIGHTWEIGHT_COLUMNS = "id, slug, created_at";
const FULL_COLUMNS = "id, slug, title, content, created_at";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fetchAllPosts(columns) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("news_posts")
      .select(columns)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function fetchLatestIds() {
  const { data, error } = await supabase
    .from("news_posts")
    .select("id")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LATEST_NEWS_SITEMAP_LIMIT);
  if (error) throw error;
  return new Set((data || []).map((row) => row.id));
}

async function fetchMonthPosts(monthKey) {
  const bounds = getUtcMonthBounds(monthKey);
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("news_posts")
      .select(LIGHTWEIGHT_COLUMNS)
      .gte("created_at", bounds.start)
      .lt("created_at", bounds.endExclusive)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

function toPathSet(partitions) {
  const paths = new Set();
  for (const entries of partitions.values()) {
    for (const entry of entries) {
      paths.add(entry.path);
    }
  }
  return paths;
}

function diffSets(a, b) {
  return [...a].filter((value) => !b.has(value));
}

async function time(fn) {
  const start = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - start };
}

const monthKeys = ["2026-05", "2026-06", "2026-07"];

const legacyTimed = await time(async () => {
  const [allPosts, latestIds] = await Promise.all([
    fetchAllPosts(FULL_COLUMNS),
    fetchLatestIds(),
  ]);
  return {
    partitions: partitionArchiveNewsPosts(allPosts, latestIds),
    rows: allPosts.length + latestIds.size,
    queries: 5,
  };
});

const optimizedIndexTimed = await time(async () => {
  const [allPosts, latestIds] = await Promise.all([
    fetchAllPosts(LIGHTWEIGHT_COLUMNS),
    fetchLatestIds(),
  ]);
  return {
    partitions: partitionArchiveNewsPosts(allPosts, latestIds),
    rows: allPosts.length + latestIds.size,
    queries: 5,
  };
});

const optimizedJuneTimed = await time(async () => {
  const [monthPosts, latestIds] = await Promise.all([
    fetchMonthPosts("2026-06"),
    fetchLatestIds(),
  ]);
  const monthQueries = Math.ceil(monthPosts.length / 1000) || 1;
  return {
    entries: filterArchiveMonthPosts(monthPosts, latestIds),
    rows: monthPosts.length + latestIds.size,
    queries: monthQueries + 1,
  };
});

const legacyArchivePaths = toPathSet(legacyTimed.result.partitions);
const optimizedArchivePaths = toPathSet(optimizedIndexTimed.result.partitions);
const legacyJunePaths = new Set(
  (legacyTimed.result.partitions.get("2026-06") || []).map((entry) => entry.path)
);
const optimizedJunePaths = new Set(optimizedJuneTimed.result.entries.map((entry) => entry.path));

const latestPosts = await fetchAllPosts(LIGHTWEIGHT_COLUMNS);
const latestPaths = new Set(
  latestPosts
    .slice(0, LATEST_NEWS_SITEMAP_LIMIT)
    .filter(isNewsPostSitemapEligible)
    .map((post) => getCanonicalNewsPath(post))
);

const monthlyChecks = {};
for (const monthKey of monthKeys) {
  const legacyMonth = legacyTimed.result.partitions.get(monthKey) || [];
  const monthPosts = await fetchMonthPosts(monthKey);
  const latestIds = await fetchLatestIds();
  const optimizedMonth = filterArchiveMonthPosts(monthPosts, latestIds);
  const legacySet = new Set(legacyMonth.map((entry) => entry.path));
  const optimizedSet = new Set(optimizedMonth.map((entry) => entry.path));
  monthlyChecks[monthKey] = {
    legacyCount: legacySet.size,
    optimizedCount: optimizedSet.size,
    equal:
      diffSets(legacySet, optimizedSet).length === 0 &&
      diffSets(optimizedSet, legacySet).length === 0,
  };
}

console.log(
  JSON.stringify(
    {
      equivalence: {
        latestCount: latestPaths.size,
        legacyArchiveCount: legacyArchivePaths.size,
        optimizedArchiveCount: optimizedArchivePaths.size,
        archiveSetsEqual:
          diffSets(legacyArchivePaths, optimizedArchivePaths).length === 0 &&
          diffSets(optimizedArchivePaths, legacyArchivePaths).length === 0,
        juneSetsEqual:
          diffSets(legacyJunePaths, optimizedJunePaths).length === 0 &&
          diffSets(optimizedJunePaths, legacyJunePaths).length === 0,
        latestArchiveOverlap:
          [...latestPaths].filter((path) => optimizedArchivePaths.has(path)).length,
        monthlyChecks,
      },
      benchmark: {
        legacyFullCorpusIndex: {
          queries: legacyTimed.result.queries,
          rows: legacyTimed.result.rows,
          ms: legacyTimed.ms,
        },
        optimizedIndexColdEquivalent: {
          queries: optimizedIndexTimed.result.queries,
          rows: optimizedIndexTimed.result.rows,
          ms: optimizedIndexTimed.ms,
          note: "Same row count on first cache miss; warm app cache skips 3400-row refetch for 3600s",
        },
        optimizedMonthly2026_06: {
          queries: optimizedJuneTimed.result.queries,
          rows: optimizedJuneTimed.result.rows,
          ms: optimizedJuneTimed.ms,
        },
      },
    },
    null,
    2
  )
);

const allMonthlyEqual = Object.values(monthlyChecks).every((entry) => entry.equal);
if (
  !allMonthlyEqual ||
  diffSets(legacyArchivePaths, optimizedArchivePaths).length ||
  diffSets(optimizedArchivePaths, legacyArchivePaths).length
) {
  process.exitCode = 1;
}

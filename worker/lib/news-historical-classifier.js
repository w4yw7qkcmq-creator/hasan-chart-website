const {
  isTelegramOnlyPublishedLink,
  isSiteEligiblePublishedLink,
} = require("./news-site-eligibility");

const CLASSIFICATION = {
  LEGACY_PRE_SITE_INTEGRATION: "LEGACY_PRE_SITE_INTEGRATION",
  TELEGRAM_ONLY_INTENTIONAL: "TELEGRAM_ONLY_INTENTIONAL",
  DEDUPE_MARKER: "DEDUPE_MARKER",
  INVALID_OR_TEST: "INVALID_OR_TEST",
  SITE_ALREADY_PRESENT_BY_CLUSTER: "SITE_ALREADY_PRESENT_BY_CLUSTER",
  GENUINELY_MISSING_SITE_POST: "GENUINELY_MISSING_SITE_POST",
};

const TEST_LINK_PATTERN = /example\.com|localhost|127\.0\.0\.1|staging|test-news|dry-run/i;
const MIN_VIABLE_CONTENT_LENGTH = 40;
const TITLE_SIMILARITY_THRESHOLD = 0.78;
const LEGACY_BUFFER_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na.includes(nb.slice(0, 30)) || nb.includes(na.slice(0, 30))) return 1;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (!wordsA.size || !wordsB.size) return 0;
  const common = [...wordsA].filter((w) => wordsB.has(w)).length;
  return common / Math.min(wordsA.size, wordsB.size);
}

function maskLink(link) {
  const value = String(link || "");
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const tail = parts.length ? parts[parts.length - 1].slice(0, 12) : "root";
    return `${url.hostname}/…/${tail}`;
  } catch {
    return value.slice(0, 24) + (value.length > 24 ? "…" : "");
  }
}

function buildSiteIndexes(newsPosts = [], publishedWithPosts = []) {
  const postsByLink = new Map();
  const postsByCluster = new Map();
  const postsByNormalizedTitle = [];

  for (const post of newsPosts) {
    postsByLink.set(post.source_link, post);
    if (post.topic_cluster) {
      postsByCluster.set(post.topic_cluster, post);
    }
    postsByNormalizedTitle.push({
      source_link: post.source_link,
      normalized_title: normalizeTitle(post.normalized_title || post.title),
      title: post.title,
      topic_cluster: post.topic_cluster || null,
    });
  }

  for (const row of publishedWithPosts) {
    if (row.topic_cluster && row.has_post) {
      postsByCluster.set(row.topic_cluster, {
        source_link: row.link,
        title: row.title,
        topic_cluster: row.topic_cluster,
      });
    }
  }

  return { postsByLink, postsByCluster, postsByNormalizedTitle };
}

function classifyHistoricalMissingRow(row, context = {}) {
  const link = String(row.link || "").trim();
  const title = String(row.title || "").trim();
  const normalizedTitle = normalizeTitle(row.normalized_title || title);
  const topicCluster = row.topic_cluster || null;
  const publishedAt = row.published_at ? new Date(row.published_at).getTime() : null;

  if (isTelegramOnlyPublishedLink(link)) {
    return {
      classification: CLASSIFICATION.TELEGRAM_ONLY_INTENTIONAL,
      recoverable: false,
      action: "none",
      reason: "telegram_only_link",
    };
  }

  if (!isSiteEligiblePublishedLink(link)) {
    return {
      classification: CLASSIFICATION.INVALID_OR_TEST,
      recoverable: false,
      action: "none",
      reason: "not_http_site_link",
    };
  }

  if (TEST_LINK_PATTERN.test(link) || normalizedTitle.length < 10) {
    return {
      classification: CLASSIFICATION.INVALID_OR_TEST,
      recoverable: false,
      action: "none",
      reason: "test_or_invalid_link",
    };
  }

  if (context.postsByLink.has(link)) {
    return {
      classification: CLASSIFICATION.SITE_ALREADY_PRESENT_BY_CLUSTER,
      recoverable: false,
      action: "none",
      reason: "link_already_has_post",
    };
  }

  if (topicCluster && context.postsByCluster.has(topicCluster)) {
    const matched = context.postsByCluster.get(topicCluster);
    return {
      classification: CLASSIFICATION.DEDUPE_MARKER,
      recoverable: false,
      action: "none",
      reason: "topic_cluster_on_site",
      matchedLink: maskLink(matched.source_link),
    };
  }

  for (const post of context.postsByNormalizedTitle) {
    const score = titleSimilarity(normalizedTitle, post.normalized_title);
    if (score >= TITLE_SIMILARITY_THRESHOLD && post.source_link !== link) {
      return {
        classification: CLASSIFICATION.SITE_ALREADY_PRESENT_BY_CLUSTER,
        recoverable: false,
        action: "none",
        reason: "normalized_title_cluster_match",
        matchedLink: maskLink(post.source_link),
        similarity: Number(score.toFixed(2)),
      };
    }
    if (
      topicCluster &&
      post.topic_cluster &&
      post.topic_cluster === topicCluster &&
      post.source_link !== link
    ) {
      return {
        classification: CLASSIFICATION.SITE_ALREADY_PRESENT_BY_CLUSTER,
        recoverable: false,
        action: "none",
        reason: "shared_topic_cluster_with_site_post",
        matchedLink: maskLink(post.source_link),
      };
    }
  }

  const firstPostAt = context.firstPostAt ? new Date(context.firstPostAt).getTime() : null;
  if (
    firstPostAt &&
    publishedAt &&
    publishedAt < firstPostAt + LEGACY_BUFFER_MS
  ) {
    return {
      classification: CLASSIFICATION.LEGACY_PRE_SITE_INTEGRATION,
      recoverable: false,
      action: "none",
      reason: "published_before_site_integration_window",
    };
  }

  if (!title || title.length < MIN_VIABLE_CONTENT_LENGTH) {
    return {
      classification: CLASSIFICATION.INVALID_OR_TEST,
      recoverable: false,
      action: "none",
      reason: "insufficient_content_for_seo",
    };
  }

  const ageDays =
    publishedAt && Number.isFinite(publishedAt)
      ? Math.floor((Date.now() - publishedAt) / (24 * 60 * 60 * 1000))
      : null;
  if (ageDays !== null && ageDays > 180) {
    return {
      classification: CLASSIFICATION.LEGACY_PRE_SITE_INTEGRATION,
      recoverable: false,
      action: "none",
      reason: "stale_for_seo_recovery",
      ageDays,
    };
  }

  return {
    classification: CLASSIFICATION.GENUINELY_MISSING_SITE_POST,
    recoverable: true,
    action: "dry_run_recovery_candidate",
    reason: "valid_site_eligible_without_site_post",
    titlePreview: title.slice(0, 80),
    publishedAt: row.published_at,
  };
}

function summarizeHistoricalClassifications(rows = []) {
  const summary = {};
  for (const key of Object.values(CLASSIFICATION)) {
    summary[key] = { count: 0, recoverable: 0, action: key === CLASSIFICATION.GENUINELY_MISSING_SITE_POST ? "dry_run_only" : "none" };
  }

  const classified = [];
  for (const row of rows) {
    const result = classifyHistoricalMissingRow(row, row._context || {});
    classified.push({
      link: maskLink(row.link),
      classification: result.classification,
      recoverable: result.recoverable,
      action: result.action,
      reason: result.reason,
      titlePreview: result.titlePreview || String(row.title || "").slice(0, 60),
      publishedAt: row.published_at || null,
      matchedLink: result.matchedLink || null,
    });
    summary[result.classification].count += 1;
    if (result.recoverable) summary[result.classification].recoverable += 1;
  }

  const unknownCount = classified.filter((row) => !Object.values(CLASSIFICATION).includes(row.classification)).length;

  return {
    summary,
    classified,
    unknownCount,
    genuinelyMissing: classified.filter(
      (row) => row.classification === CLASSIFICATION.GENUINELY_MISSING_SITE_POST
    ),
    table: Object.entries(summary).map(([classification, value]) => ({
      classification,
      count: value.count,
      recoverable: value.recoverable,
      action: value.action,
    })),
  };
}

module.exports = {
  CLASSIFICATION,
  normalizeTitle,
  titleSimilarity,
  maskLink,
  buildSiteIndexes,
  classifyHistoricalMissingRow,
  summarizeHistoricalClassifications,
};

const {
  classifyPublishedNewsLink,
  isSiteEligiblePublishedLink,
  isTelegramOnlyPublishedLink,
} = require("./news-site-eligibility");
const {
  buildSiteIndexes,
  classifyHistoricalMissingRow,
  summarizeHistoricalClassifications,
  maskLink,
} = require("./news-historical-classifier");

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildRecoveryCandidate(row, existingPostsByLink, postsByCluster) {
  const link = row.link;
  const classification = classifyPublishedNewsLink(link);

  if (classification !== "site_eligible") {
    return { link, classification, action: "skip_not_site_eligible" };
  }

  if (existingPostsByLink.has(link)) {
    return { link, classification, action: "skip_already_on_site" };
  }

  const cluster = row.topic_cluster || null;
  if (cluster && postsByCluster.has(cluster)) {
    return {
      link,
      classification,
      action: "skip_dedupe_marker",
      reason: "topic_cluster_already_on_site",
      topicCluster: cluster,
      historicalClassification: "DEDUPE_MARKER",
    };
  }

  const title = String(row.title || "").trim();
  const normalizedTitle = normalizeTitle(row.normalized_title || title);
  if (!title || title.length < 40) {
    return { link, classification, action: "skip_insufficient_content", reason: "title_too_short" };
  }

  return {
    link,
    classification,
    action: "recover_site_post",
    title: title.slice(0, 500),
    normalizedTitle: normalizedTitle.slice(0, 500),
    topicCluster: cluster,
    publishedAt: row.published_at || row.created_at || null,
    impactLevel: "MEDIUM",
  };
}

async function auditSitePublishParity(getSupabaseClient, options = {}) {
  const since = options.since || null;
  const limit = options.limit || 500;
  const client = getSupabaseClient?.();

  if (!client) {
    return { ok: false, reason: "supabase_unavailable" };
  }

  let query = client
    .from("published_news")
    .select("link,title,normalized_title,topic_cluster,published_at,created_at")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte("published_at", since);
  }

  const [{ data: publishedRows, error: publishedError }, { data: postRows, error: postsError }] =
    await Promise.all([
      query,
      client.from("news_posts").select("id,source_link,title,created_at").order("created_at", { ascending: false }).limit(limit),
    ]);

  if (publishedError || postsError) {
    return {
      ok: false,
      reason: publishedError?.message || postsError?.message || "query_failed",
    };
  }

  const existingPostsByLink = new Map((postRows || []).map((row) => [row.source_link, row]));
  const postsByCluster = new Map();

  for (const row of postRows || []) {
    const cluster = row.title ? normalizeTitle(row.title).slice(0, 120) : null;
    if (cluster) postsByCluster.set(cluster, row);
  }

  for (const row of publishedRows || []) {
    const cluster = row.topic_cluster;
    if (cluster && !postsByCluster.has(cluster)) {
      postsByCluster.set(cluster, { source_link: row.link, title: row.title });
    }
  }

  const summary = {
    telegramOnlyIntentional: 0,
    siteEligible: 0,
    sitePublished: 0,
    dedupeMarkers: 0,
    accuratelyClassifiedMissing: 0,
    siteMissingRecoverable: 0,
    siteMissingTerminal: 0,
    retryableFailures: 0,
    terminalFailures: 0,
  };

  const items = [];

  for (const row of publishedRows || []) {
    const candidate = buildRecoveryCandidate(row, existingPostsByLink, postsByCluster);
    items.push(candidate);

    if (isTelegramOnlyPublishedLink(row.link)) {
      summary.telegramOnlyIntentional += 1;
      continue;
    }

    if (!isSiteEligiblePublishedLink(row.link)) {
      continue;
    }

    summary.siteEligible += 1;

    if (candidate.action === "skip_already_on_site") {
      summary.sitePublished += 1;
    } else if (candidate.action === "skip_dedupe_marker") {
      summary.dedupeMarkers += 1;
      summary.accuratelyClassifiedMissing += 1;
    } else if (candidate.action === "recover_site_post") {
      summary.siteMissingRecoverable += 1;
      summary.retryableFailures += 1;
    } else if (candidate.action === "skip_insufficient_content") {
      summary.siteMissingTerminal += 1;
      summary.terminalFailures += 1;
    }
  }

  return {
    ok: true,
    since,
    summary,
    recoverable: items.filter((item) => item.action === "recover_site_post"),
    items: items.slice(0, 50),
  };
}

async function dryRunRecoverMissingSitePosts(getSupabaseClient, options = {}) {
  const audit = await auditSitePublishParity(getSupabaseClient, options);
  if (!audit.ok) {
    return audit;
  }

  return {
    ok: true,
    dryRun: true,
    wouldRecover: audit.recoverable.length,
    recoverable: audit.recoverable,
    summary: audit.summary,
  };
}

async function recoverMissingSitePosts(getSupabaseClient, deps = {}, options = {}) {
  if (options.dryRun !== false && options.execute !== true) {
    return dryRunRecoverMissingSitePosts(getSupabaseClient, options);
  }

  const audit = await auditSitePublishParity(getSupabaseClient, options);
  if (!audit.ok) {
    return audit;
  }

  const results = [];
  for (const candidate of audit.recoverable) {
    if (!deps.saveNewsPostToSupabase) {
      results.push({ link: candidate.link, recovered: false, reason: "save_fn_missing" });
      continue;
    }

    const saveResult = await deps.saveNewsPostToSupabase({
      title: candidate.title.slice(0, 200),
      content: candidate.title,
      image_url: null,
      impact_level: candidate.impactLevel || "MEDIUM",
      source_link: candidate.link,
    });

    results.push({
      link: candidate.link,
      recovered: Boolean(saveResult?.ok),
      error: saveResult?.error || null,
    });
  }

  return {
    ok: true,
    dryRun: false,
    recovered: results.filter((row) => row.recovered).length,
    failed: results.filter((row) => !row.recovered).length,
    results,
    summary: audit.summary,
  };
}

async function auditHistoricalMissingSitePosts(getSupabaseClient, options = {}) {
  const client = getSupabaseClient?.();
  if (!client) {
    return { ok: false, reason: "supabase_unavailable" };
  }

  const postedLinks = new Set();
  let postOffset = 0;
  const postPageSize = 1000;
  let firstPostAt = null;

  while (true) {
    const { data, error } = await client
      .from("news_posts")
      .select("id,source_link,title,normalized_title,created_at")
      .order("created_at", { ascending: true })
      .range(postOffset, postOffset + postPageSize - 1);

    if (error) {
      return { ok: false, reason: error.message || "news_posts_query_failed" };
    }
    if (!data?.length) break;

    for (const row of data) {
      if (row.source_link) postedLinks.add(row.source_link);
      if (!firstPostAt) firstPostAt = row.created_at;
    }

    if (data.length < postPageSize) break;
    postOffset += postPageSize;
  }

  const postsWithClusters = [];
  postOffset = 0;
  while (true) {
    const { data, error } = await client
      .from("news_posts")
      .select("id,source_link,title,normalized_title,created_at")
      .order("created_at", { ascending: true })
      .range(postOffset, postOffset + postPageSize - 1);

    if (error) {
      return { ok: false, reason: error.message || "news_posts_cluster_query_failed" };
    }
    if (!data?.length) break;
    postsWithClusters.push(...data);
    if (data.length < postPageSize) break;
    postOffset += postPageSize;
  }

  const { data: clusterRows, error: clusterError } = await client
    .from("published_news")
    .select("link,title,topic_cluster")
    .not("topic_cluster", "is", null)
    .limit(5000);

  if (clusterError) {
    return { ok: false, reason: clusterError.message || "published_news_cluster_query_failed" };
  }

  const clusterByLink = new Map((clusterRows || []).map((row) => [row.link, row.topic_cluster]));
  for (const post of postsWithClusters) {
    post.topic_cluster = clusterByLink.get(post.source_link) || null;
  }

  const missingRows = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await client
      .from("published_news")
      .select("link,title,normalized_title,topic_cluster,published_at,created_at")
      .order("published_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return { ok: false, reason: error.message || "published_news_query_failed" };
    }
    if (!data?.length) break;

    for (const row of data) {
      if (
        postedLinks.has(row.link) ||
        !isSiteEligiblePublishedLink(row.link) ||
        isTelegramOnlyPublishedLink(row.link)
      ) {
        continue;
      }
      missingRows.push(row);
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const publishedWithPosts = postsWithClusters.map((post) => ({
    link: post.source_link,
    title: post.title,
    topic_cluster: post.topic_cluster,
    has_post: true,
  }));

  const context = {
    ...buildSiteIndexes(postsWithClusters, publishedWithPosts),
    firstPostAt,
  };

  const rowsForSummary = missingRows.map((row) => ({ ...row, _context: context }));
  const report = summarizeHistoricalClassifications(rowsForSummary);

  return {
    ok: true,
    totalMissingSiteEligible: missingRows.length,
    unknownCount: report.unknownCount,
    table: report.table,
    genuinelyMissing: report.genuinelyMissing,
    classifiedSample: report.classified.slice(0, 25),
    dryRunRecoveryCandidates: report.genuinelyMissing,
  };
}

module.exports = {
  auditSitePublishParity,
  dryRunRecoverMissingSitePosts,
  recoverMissingSitePosts,
  buildRecoveryCandidate,
  auditHistoricalMissingSitePosts,
};

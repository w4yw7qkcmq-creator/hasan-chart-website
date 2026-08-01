const GENERAL_MERGE_WINDOW_MS = Number(process.env.TELEGRAM_GENERAL_MERGE_WINDOW_MS || 15000);
const ECONOMIC_MERGE_WINDOW_MS = Number(process.env.TELEGRAM_ECONOMIC_MERGE_WINDOW_MS || 8000);

function getMergeWindowMs(facts = {}) {
  if (facts.isStructuredTriple || facts.importance === "high") {
    return ECONOMIC_MERGE_WINDOW_MS;
  }
  return GENERAL_MERGE_WINDOW_MS;
}

function groupPostsForMergeWindow(posts, factsByPostId) {
  const sorted = [...posts].sort(
    (a, b) => new Date(a.sourcePublishedAt).getTime() - new Date(b.sourcePublishedAt).getTime()
  );
  const groups = [];

  for (const post of sorted) {
    const facts = factsByPostId.get(`${post.sourceChannel}:${post.sourceMessageId}`) || {};
    const windowMs = getMergeWindowMs(facts);
    const postTime = new Date(post.sourcePublishedAt).getTime();

    const existingGroup = groups.find((group) => {
      const anchorFacts = group.facts;
      const anchorWindow = getMergeWindowMs(anchorFacts);
      const delta = postTime - group.anchorTime;
      return delta >= 0 && delta <= Math.max(windowMs, anchorWindow);
    });

    if (!existingGroup) {
      groups.push({
        anchorTime: postTime,
        posts: [post],
        facts,
      });
      continue;
    }

    existingGroup.posts.push(post);
  }

  return groups;
}

module.exports = {
  GENERAL_MERGE_WINDOW_MS,
  ECONOMIC_MERGE_WINDOW_MS,
  getMergeWindowMs,
  groupPostsForMergeWindow,
};

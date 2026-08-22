const { isGenericTitle } = require("./editorial-title");

function detectStoryTopic(text) {
  const value = String(text || "").toLowerCase();
  if (/trump|ترامب/.test(value)) return "trump";
  if (/iran|إيران/.test(value)) return "iran";
  if (/japan|اليابان|yen|ين/.test(value)) return "japan";
  if (/gold|الذهب/.test(value)) return "gold";
  if (/fed|fomc|fedwatch|فائدة|فدرالي/.test(value)) return "fed";
  if (/ukraine|أوكران|patriot/.test(value)) return "ukraine";
  if (/oil|نفط|brent/.test(value)) return "oil";
  if (/bitcoin|btc|crypto|كريبتو/.test(value)) return "crypto";
  return "general";
}

function splitMultiStoryPost(post) {
  const rawText = String(post.rawText || "").trim();
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const isDigest = /موجز|digest|evening|مساء|roundup|headlines/i.test(rawText);
  const bulletLines = lines.filter((line) => /^[•▪️\-–—]/.test(line));

  if (!isDigest && bulletLines.length < 3) {
    return { stories: [{ ...post, _storyCount: 1, _storyIndex: 0 }], split: false };
  }

  const storyLines = bulletLines.length >= 2 ? bulletLines : lines.filter((line) => !isGenericTitle(line));
  const candidates = [];

  for (const line of storyLines) {
    const cleaned = line.replace(/^[•▪️\-–—]+\s*/u, "").trim();
    if (cleaned.length < 20 || isGenericTitle(cleaned)) {
      continue;
    }
    candidates.push({
      text: cleaned,
      topic: detectStoryTopic(cleaned),
    });
  }

  if (candidates.length < 2) {
    if (isDigest) {
      return { stories: [], split: false, unclear: true, reason: "MULTI_STORY_UNCLEAR" };
    }
    return { stories: [{ ...post, _storyCount: 1, _storyIndex: 0 }], split: false };
  }

  const uniqueTopics = [...new Set(candidates.map((entry) => entry.topic))];
  if (uniqueTopics.length < 2 && candidates.length < 3) {
    return { stories: [{ ...post, _storyCount: 1, _storyIndex: 0 }], split: false };
  }

  const selected = candidates.slice(0, 3);
  const stories = selected.map((entry, index) => ({
    ...post,
    rawText: entry.text,
    sourceMessageId: `${post.sourceMessageId}:s${index + 1}`,
    sourceUrl: `${post.sourceUrl || ""}#story-${index + 1}`,
    _parentMessageId: post.sourceMessageId,
    _storyIndex: index,
    _storyCount: selected.length,
    _storyTopic: entry.topic,
  }));

  return { stories, split: true, storyCount: stories.length };
}

function splitEconomicStructuredSections(post) {
  const rawText = String(post.rawText || "").trim();
  const markerPattern = /(?:🟥|🚨)\s*\u0635\u062F\u0631\s*\u0627\u0644\u0622(?:\u0646|\u0627\u0646)/gi;
  const markers = [...rawText.matchAll(markerPattern)];
  if (markers.length < 2) {
    return { stories: [{ ...post, _storyCount: 1, _storyIndex: 0 }], split: false };
  }

  const sections = [];
  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : rawText.length;
    const chunk = rawText.slice(start, end).trim();
    if (chunk.length >= 40) {
      sections.push(chunk);
    }
  }

  if (sections.length < 2) {
    return { stories: [{ ...post, _storyCount: 1, _storyIndex: 0 }], split: false };
  }

  const stories = sections.slice(0, 4).map((chunk, index) => ({
    ...post,
    rawText: chunk,
    sourceMessageId: `${post.sourceMessageId}:e${index + 1}`,
    sourceUrl: `${post.sourceUrl || ""}#economic-${index + 1}`,
    _parentMessageId: post.sourceMessageId,
    _storyIndex: index,
    _storyCount: sections.length,
    _economicBundle: true,
  }));

  return { stories, split: true, storyCount: stories.length };
}

function expandPostsWithMultiStory(posts, stats = {}) {
  const expanded = [];

  for (const post of posts) {
    const economicBundle = splitEconomicStructuredSections(post);
    if (economicBundle.split) {
      stats.economicBundleSplit = (stats.economicBundleSplit || 0) + economicBundle.storyCount;
      expanded.push(...economicBundle.stories);
      continue;
    }

    const result = splitMultiStoryPost(post);
    if (result.unclear) {
      stats.multiStoryUnclear = (stats.multiStoryUnclear || 0) + 1;
      expanded.push({
        ...post,
        _multiStoryUnclear: true,
        _skipReason: result.reason,
      });
      continue;
    }

    if (result.split) {
      stats.multiStorySplit = (stats.multiStorySplit || 0) + (result.storyCount || result.stories.length);
    }

    expanded.push(...result.stories);
  }

  return expanded;
}

module.exports = {
  splitMultiStoryPost,
  splitEconomicStructuredSections,
  expandPostsWithMultiStory,
  detectStoryTopic,
};

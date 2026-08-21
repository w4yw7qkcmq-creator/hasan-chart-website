import { withReadCache } from "../server-read-cache.js";
import {
  MANUAL_PUBLIC_DISPLAY_LIMIT,
  MERGED_FEED_DISPLAY_CAP,
  TELEGRAM_PUBLIC_DISPLAY_LIMIT,
  TELEGRAM_SECTION_FEED_CACHE_MS,
  sectionFeedCacheKey,
} from "./constants.js";
import { fetchEligibleTelegramPostBySlug, fetchEligibleTelegramPosts } from "./telegram-fetch.js";
import { mergeFeedItemsByPublishedAt } from "./merge.js";
import { normalizeTelegramForContentPost, normalizeTelegramForDailyAnalysis } from "./normalize.js";
import { isTelegramContentPublicSlug } from "./telegram-slug.js";

export {
  TELEGRAM_PUBLIC_DISPLAY_LIMIT,
  MANUAL_PUBLIC_DISPLAY_LIMIT,
  MERGED_FEED_DISPLAY_CAP,
  TELEGRAM_SECTION_FEED_CACHE_MS,
  sectionFeedCacheKey,
} from "./constants.js";
export { isTelegramContentPublicSlug } from "./telegram-slug.js";
export { deriveTelegramPresentationTitle } from "./presentation-title.js";

async function loadTelegramSectionPosts(section) {
  const { data } = await withReadCache(
    sectionFeedCacheKey(section),
    TELEGRAM_SECTION_FEED_CACHE_MS,
    () => fetchEligibleTelegramPosts(section, { limit: TELEGRAM_PUBLIC_DISPLAY_LIMIT })
  );
  return data || [];
}

export async function fetchTelegramDailyAnalysisItems() {
  try {
    const rows = await loadTelegramSectionPosts("daily_analysis");
    return rows.map(normalizeTelegramForDailyAnalysis).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchMergedContentPosts(contentType, {
  manualFetcher,
  limit = MANUAL_PUBLIC_DISPLAY_LIMIT,
} = {}) {
  const section = contentType === "result" ? "result" : "academy";

  let manualPosts = [];
  try {
    manualPosts = (await manualFetcher({ limit })) || [];
  } catch {
    manualPosts = [];
  }

  let telegramPosts = [];
  try {
    const rows = await loadTelegramSectionPosts(section);
    telegramPosts = rows
      .map((row) => normalizeTelegramForContentPost(row, contentType))
      .filter(Boolean);
  } catch {
    telegramPosts = [];
  }

  const manualNormalized = manualPosts.map((post) => ({ ...post, source: post.source || "manual" }));

  return mergeFeedItemsByPublishedAt([...manualNormalized, ...telegramPosts], {
    cap: MERGED_FEED_DISPLAY_CAP,
  });
}

export async function fetchMergedContentPostBySlug(contentType, slug, { manualFetcher } = {}) {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return null;

  const section = contentType === "result" ? "result" : "academy";

  if (isTelegramContentPublicSlug(normalizedSlug)) {
    try {
      const row = await fetchEligibleTelegramPostBySlug(section, normalizedSlug);
      return normalizeTelegramForContentPost(row, contentType);
    } catch {
      return null;
    }
  }

  try {
    const manual = await manualFetcher(normalizedSlug);
    if (!manual) return null;
    return { ...manual, source: "manual" };
  } catch {
    return null;
  }
}

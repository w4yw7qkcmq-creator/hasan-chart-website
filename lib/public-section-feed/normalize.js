import { deriveTelegramPresentationTitle } from "./presentation-title.js";

export function normalizeTelegramForContentPost(telegramPost, contentType) {
  if (!telegramPost?.id) return null;

  const title = telegramPost.presentation_title ||
    deriveTelegramPresentationTitle(telegramPost.body, telegramPost.display_title);

  return {
    id: telegramPost.id,
    content_type: contentType,
    slug: telegramPost.public_slug,
    title,
    summary: null,
    body: telegramPost.body,
    image_path: null,
    image_url: telegramPost.image_url || null,
    images: telegramPost.images || [],
    category: null,
    highlight_value: null,
    status: "published",
    published_at: telegramPost.published_at,
    created_at: telegramPost.created_at,
    updated_at: telegramPost.updated_at,
    source: "telegram",
  };
}

export function normalizeTelegramForDailyAnalysis(telegramPost) {
  if (!telegramPost?.id) return null;

  return {
    id: `telegram:${telegramPost.id}`,
    source: "telegram",
    title:
      telegramPost.presentation_title ||
      deriveTelegramPresentationTitle(telegramPost.body, telegramPost.display_title),
    content: telegramPost.body,
    createdAt: telegramPost.published_at || telegramPost.created_at,
    published: true,
    images: (telegramPost.images || []).map((img) => ({
      url: img.url,
      width: img.width,
      height: img.height,
      sortOrder: img.sort_order,
    })),
  };
}

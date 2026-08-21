import { buildTelegramContentImagePublicUrl } from "../telegram-content-image-url.js";
import { TELEGRAM_PUBLIC_DISPLAY_LIMIT } from "./constants.js";
import { deriveTelegramPresentationTitle } from "./presentation-title.js";
import { getPublicSupabaseClient } from "./supabase-public.js";

const TELEGRAM_POST_COLUMNS =
  "id, section, body, public_slug, display_title, published_at, created_at, updated_at, telegram_message_id";

function mapImages(rows = []) {
  return rows
    .map((row) => ({
      sort_order: row.sort_order,
      url: buildTelegramContentImagePublicUrl(row.storage_path),
      width: row.width ?? null,
      height: row.height ?? null,
      storage_path: row.storage_path,
    }))
    .filter((img) => img.url)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function fetchEligibleTelegramPosts(section, { limit = TELEGRAM_PUBLIC_DISPLAY_LIMIT } = {}) {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return [];

  const boundedLimit = Math.min(Math.max(limit, 1), TELEGRAM_PUBLIC_DISPLAY_LIMIT);

  const { data: posts, error } = await supabase
    .from("telegram_content_posts")
    .select(TELEGRAM_POST_COLUMNS)
    .eq("section", section)
    .eq("sync_status", "published")
    .eq("qualification_status", "eligible")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(boundedLimit);

  if (error) throw error;
  if (!posts?.length) return [];

  const postIds = posts.map((p) => p.id);
  const { data: images, error: imageError } = await supabase
    .from("telegram_content_images")
    .select("post_id, sort_order, storage_path, width, height")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  if (imageError) throw imageError;

  const imagesByPost = new Map();
  for (const row of images || []) {
    const list = imagesByPost.get(row.post_id) || [];
    list.push(row);
    imagesByPost.set(row.post_id, list);
  }

  return posts.map((post) => {
    const mappedImages = mapImages(imagesByPost.get(post.id) || []);
    return {
      ...post,
      images: mappedImages,
      image_url: mappedImages[0]?.url || null,
      presentation_title: deriveTelegramPresentationTitle(post.body, post.display_title),
    };
  });
}

export async function fetchEligibleTelegramPostBySlug(section, slug) {
  const normalized = String(slug || "").trim();
  if (!normalized) return null;

  const supabase = getPublicSupabaseClient();
  if (!supabase) return null;

  const { data: post, error } = await supabase
    .from("telegram_content_posts")
    .select(TELEGRAM_POST_COLUMNS)
    .eq("section", section)
    .eq("public_slug", normalized)
    .eq("sync_status", "published")
    .eq("qualification_status", "eligible")
    .maybeSingle();

  if (error) throw error;
  if (!post) return null;

  const { data: images, error: imageError } = await supabase
    .from("telegram_content_images")
    .select("post_id, sort_order, storage_path, width, height")
    .eq("post_id", post.id)
    .order("sort_order", { ascending: true });

  if (imageError) throw imageError;

  const mappedImages = mapImages(images || []);
  return {
    ...post,
    images: mappedImages,
    image_url: mappedImages[0]?.url || null,
    presentation_title: deriveTelegramPresentationTitle(post.body, post.display_title),
  };
}

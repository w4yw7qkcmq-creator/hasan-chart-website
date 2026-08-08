export const CONTENT_IMAGE_BUCKET = "content-images";

export function buildContentImagePublicUrl(imagePath) {
  const normalized = String(imagePath || "").trim();
  if (!normalized) return null;

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;

  return `${base}/storage/v1/object/public/${CONTENT_IMAGE_BUCKET}/${normalized}`;
}

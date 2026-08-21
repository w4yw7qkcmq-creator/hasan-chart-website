export const TELEGRAM_CONTENT_BUCKET = "telegram-content-images";

export function buildTelegramContentImagePublicUrl(storagePath) {
  const normalized = String(storagePath || "").trim();
  if (!normalized) return null;

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;

  return `${base}/storage/v1/object/public/${TELEGRAM_CONTENT_BUCKET}/${normalized}`;
}

const crypto = require("crypto");

const NEWS_IMAGE_BUCKET = process.env.NEWS_IMAGE_STORAGE_BUCKET || "news-images";

function sanitizePublicationKey(value) {
  const normalized = String(value || "news")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return normalized || "news";
}

function buildNewsImageObjectPath(publicationKey, date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const key = sanitizePublicationKey(publicationKey);
  return `news-images/${year}/${month}/${key}.png`;
}

function buildStablePublicationKey(publication = {}) {
  const explicit =
    publication.eventKey ||
    publication.metadata?.idempotencyKey ||
    publication.sourceLink ||
    publication.metadata?.candidate?.post?.sourceMessageId ||
    null;
  if (explicit) {
    return sanitizePublicationKey(explicit);
  }
  const hash = crypto
    .createHash("sha1")
    .update(`${publication.title || ""}|${publication.sourceType || ""}|${publication.sourceId || ""}`)
    .digest("hex")
    .slice(0, 24);
  return `news-${hash}`;
}

async function uploadNewsImageBuffer(supabase, buffer, publication = {}, options = {}) {
  if (!supabase || !buffer?.length) {
    return { ok: false, reason: "storage_unavailable" };
  }

  const publicationKey = options.publicationKey || buildStablePublicationKey(publication);
  const objectPath = buildNewsImageObjectPath(publicationKey, options.date || new Date());

  try {
    const { error } = await supabase.storage.from(NEWS_IMAGE_BUCKET).upload(objectPath, buffer, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "public, max-age=31536000, immutable",
    });
    if (error) {
      return { ok: false, reason: error.message, objectPath, bucket: NEWS_IMAGE_BUCKET };
    }

    const { data } = supabase.storage.from(NEWS_IMAGE_BUCKET).getPublicUrl(objectPath);
    return {
      ok: true,
      bucket: NEWS_IMAGE_BUCKET,
      objectPath,
      publicUrl: data?.publicUrl || null,
      publicationKey,
    };
  } catch (error) {
    return { ok: false, reason: error.message, bucket: NEWS_IMAGE_BUCKET };
  }
}

module.exports = {
  NEWS_IMAGE_BUCKET,
  buildNewsImageObjectPath,
  buildStablePublicationKey,
  uploadNewsImageBuffer,
};

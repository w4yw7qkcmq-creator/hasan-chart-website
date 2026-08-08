import {
  CONTENT_POST_STATUSES,
  CONTENT_POST_TYPES,
  isAllowedCategory,
} from "./content-post-categories.js";
import { validateContentPostSlug } from "./content-post-slug.js";
import { isValidContentImageObjectPath } from "./content-image-storage.js";

export const CONTENT_POST_LIMITS = Object.freeze({
  titleMin: 3,
  titleMax: 200,
  summaryMax: 500,
  bodyMin: 10,
  bodyMax: 50000,
  highlightMax: 80,
});

export function normalizeContentType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CONTENT_POST_TYPES.includes(normalized) ? normalized : null;
}

export function normalizeContentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CONTENT_POST_STATUSES.includes(normalized) ? normalized : null;
}

export function validateContentPostPayload(payload, { contentType, isUpdate = false } = {}) {
  const errors = [];
  const normalizedType = normalizeContentType(contentType || payload?.content_type);

  if (!normalizedType) {
    errors.push("نوع المحتوى غير صالح");
  }

  const title = String(payload?.title ?? "").trim();
  if (!isUpdate || payload?.title !== undefined) {
    if (title.length < CONTENT_POST_LIMITS.titleMin) {
      errors.push("العنوان قصير جداً");
    }
    if (title.length > CONTENT_POST_LIMITS.titleMax) {
      errors.push("العنوان طويل جداً");
    }
  }

  const summary =
    payload?.summary === undefined || payload?.summary === null
      ? undefined
      : String(payload.summary).trim();
  if (summary !== undefined && summary.length > CONTENT_POST_LIMITS.summaryMax) {
    errors.push("الملخص طويل جداً");
  }

  const body = payload?.body === undefined ? undefined : String(payload.body ?? "").trim();
  if (!isUpdate || payload?.body !== undefined) {
    if (!body || body.length < CONTENT_POST_LIMITS.bodyMin) {
      errors.push("المحتوى قصير جداً");
    }
    if (body && body.length > CONTENT_POST_LIMITS.bodyMax) {
      errors.push("المحتوى طويل جداً");
    }
  }

  const category =
    payload?.category === undefined || payload?.category === null
      ? undefined
      : String(payload.category).trim() || null;
  if (category && normalizedType && !isAllowedCategory(normalizedType, category)) {
    errors.push("التصنيف غير مسموح");
  }

  const highlight =
    payload?.highlight_value === undefined || payload?.highlight_value === null
      ? undefined
      : String(payload.highlight_value).trim() || null;
  if (highlight !== undefined && highlight && highlight.length > CONTENT_POST_LIMITS.highlightMax) {
    errors.push("قيمة التمييز طويلة جداً");
  }
  if (normalizedType === "academy" && highlight) {
    errors.push("قيمة التمييز متاحة للنتائج فقط");
  }

  const slug = payload?.slug === undefined ? undefined : String(payload.slug ?? "").trim();
  if (slug !== undefined && slug) {
    const slugValidation = validateContentPostSlug(slug);
    if (!slugValidation.ok) {
      errors.push("الرابط المختصر غير صالح");
    }
  }

  const imagePath =
    payload?.image_path === undefined || payload?.image_path === null
      ? undefined
      : String(payload.image_path).trim() || null;
  if (imagePath && normalizedType && !isValidContentImageObjectPath(imagePath, normalizedType)) {
    errors.push("مسار الصورة غير صالح");
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      content_type: normalizedType,
      title: title || undefined,
      summary: summary === undefined ? undefined : summary || null,
      body: body || undefined,
      category: category === undefined ? undefined : category,
      highlight_value: highlight === undefined ? undefined : highlight,
      slug: slug === undefined ? undefined : slug || null,
      image_path: imagePath === undefined ? undefined : imagePath,
    },
  };
}

export function assertAllowedStatusTransition(currentStatus, nextStatus) {
  const current = normalizeContentStatus(currentStatus);
  const next = normalizeContentStatus(nextStatus);
  if (!current || !next) {
    return { ok: false, error: "حالة غير صالحة" };
  }
  if (current === next) {
    return { ok: true };
  }

  const allowed = {
    draft: new Set(["draft", "published", "archived"]),
    published: new Set(["published", "archived"]),
    archived: new Set(["archived", "published"]),
  };

  if (!allowed[current]?.has(next)) {
    return { ok: false, error: "انتقال الحالة غير مسموح" };
  }

  return { ok: true };
}

export function sanitizeContentPostForPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    content_type: row.content_type,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    body: row.body,
    image_path: row.image_path,
    category: row.category,
    highlight_value: row.highlight_value,
    status: row.status,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function sanitizeContentPostForAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    content_type: row.content_type,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    body: row.body,
    image_path: row.image_path,
    category: row.category,
    highlight_value: row.highlight_value,
    status: row.status,
    published_at: row.published_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

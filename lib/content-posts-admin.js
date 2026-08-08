import { logContentPostAudit } from "./content-post-audit.js";
import { revalidateContentPostPages } from "./content-post-revalidation.js";
import {
  assertContentImagePathOwnedByPost,
  validateUploadedContentImageObject,
} from "./content-image-storage.js";
import { resolveUniqueContentPostSlug } from "./content-post-slug.js";
import {
  normalizeContentType,
  sanitizeContentPostForAdmin,
  validateContentPostPayload,
} from "./content-post-validation.js";

const ADMIN_COLUMNS =
  "id,content_type,title,slug,summary,body,image_path,category,highlight_value,status,published_at,created_by,updated_by,created_at,updated_at,deleted_at";

function buildListQuery(supabase, { contentType, status = null, search = null, includeDeleted = false }) {
  let query = supabase
    .from("content_posts")
    .select(ADMIN_COLUMNS, { count: "exact" })
    .eq("content_type", contentType)
    .order("updated_at", { ascending: false });

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  return query;
}

export async function listAdminContentPosts(supabase, { contentType, status = null, search = null, page = 1, pageSize = 20 }) {
  const normalizedType = normalizeContentType(contentType);
  if (!normalizedType) {
    throw Object.assign(new Error("نوع المحتوى غير صالح"), { status: 400 });
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const query = buildListQuery(supabase, {
    contentType: normalizedType,
    status: status || null,
    search: search ? String(search).trim() : null,
  }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    posts: (data || []).map(sanitizeContentPostForAdmin),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / safePageSize) || 1,
    },
  };
}

export async function getAdminContentPostById(supabase, id) {
  const { data, error } = await supabase
    .from("content_posts")
    .select(ADMIN_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("المنشور غير موجود"), { status: 404, code: "NOT_FOUND" });
  }

  return sanitizeContentPostForAdmin(data);
}

async function loadMutablePost(supabase, id) {
  const { data, error } = await supabase
    .from("content_posts")
    .select(ADMIN_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("المنشور غير موجود"), { status: 404, code: "NOT_FOUND" });
  }
  return data;
}

export async function createAdminContentPost(
  supabase,
  { contentType, payload, adminUserId, adminEmail }
) {
  const normalizedType = normalizeContentType(contentType);
  const validation = validateContentPostPayload(payload, { contentType: normalizedType, isUpdate: false });
  if (!validation.ok) {
    throw Object.assign(new Error(validation.errors[0]), { status: 400, code: "VALIDATION_FAILED", errors: validation.errors });
  }

  const slug = await resolveUniqueContentPostSlug(supabase, {
    contentType: normalizedType,
    title: validation.normalized.title,
    slug: validation.normalized.slug,
  });

  const row = {
    content_type: normalizedType,
    title: validation.normalized.title,
    slug,
    summary: validation.normalized.summary ?? null,
    body: validation.normalized.body,
    image_path: validation.normalized.image_path ?? null,
    category: validation.normalized.category ?? null,
    highlight_value: normalizedType === "result" ? validation.normalized.highlight_value ?? null : null,
    status: "draft",
    created_by: adminUserId || null,
    updated_by: adminUserId || null,
  };

  const { data, error } = await supabase.from("content_posts").insert(row).select(ADMIN_COLUMNS).single();
  if (error) throw error;

  await logContentPostAudit(supabase, {
    adminUserId,
    adminEmail,
    action: "content_post.create",
    postId: data.id,
    contentType: data.content_type,
    title: data.title,
    statusBefore: null,
    statusAfter: data.status,
  });

  revalidateContentPostPages({ contentType: data.content_type, slug: data.slug });

  return sanitizeContentPostForAdmin(data);
}

export async function updateAdminContentPost(
  supabase,
  { id, payload, adminUserId, adminEmail }
) {
  const existing = await loadMutablePost(supabase, id);
  const validation = validateContentPostPayload(payload, {
    contentType: existing.content_type,
    isUpdate: true,
  });
  if (!validation.ok) {
    throw Object.assign(new Error(validation.errors[0]), { status: 400, code: "VALIDATION_FAILED", errors: validation.errors });
  }

  const patch = {
    updated_by: adminUserId || null,
  };

  if (validation.normalized.title !== undefined) patch.title = validation.normalized.title;
  if (validation.normalized.summary !== undefined) patch.summary = validation.normalized.summary;
  if (validation.normalized.body !== undefined) patch.body = validation.normalized.body;
  if (validation.normalized.category !== undefined) patch.category = validation.normalized.category;
  if (validation.normalized.image_path !== undefined) patch.image_path = validation.normalized.image_path;

  if (existing.content_type === "result" && validation.normalized.highlight_value !== undefined) {
    patch.highlight_value = validation.normalized.highlight_value;
  }

  const nextTitle = patch.title ?? existing.title;
  const shouldRegenerateSlug =
    validation.normalized.slug !== undefined ||
    (patch.title && patch.title !== existing.title && !validation.normalized.slug);

  if (shouldRegenerateSlug) {
    patch.slug = await resolveUniqueContentPostSlug(supabase, {
      contentType: existing.content_type,
      title: nextTitle,
      slug: validation.normalized.slug ?? existing.slug,
      excludeId: existing.id,
    });
  }

  const { data, error } = await supabase
    .from("content_posts")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select(ADMIN_COLUMNS)
    .single();

  if (error) throw error;

  await logContentPostAudit(supabase, {
    adminUserId,
    adminEmail,
    action: "content_post.update",
    postId: data.id,
    contentType: data.content_type,
    title: data.title,
    statusBefore: existing.status,
    statusAfter: data.status,
  });

  revalidateContentPostPages({
    contentType: data.content_type,
    slug: data.slug,
    previousSlug: existing.slug !== data.slug ? existing.slug : undefined,
  });

  return sanitizeContentPostForAdmin(data);
}

export async function publishAdminContentPost(supabase, { id, adminUserId, adminEmail }) {
  const existing = await loadMutablePost(supabase, id);
  const isRepublish = existing.status === "archived" && existing.published_at;

  const patch = {
    status: "published",
    updated_by: adminUserId || null,
  };

  if (!existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("content_posts")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select(ADMIN_COLUMNS)
    .single();

  if (error) throw error;

  await logContentPostAudit(supabase, {
    adminUserId,
    adminEmail,
    action: isRepublish ? "content_post.republish" : "content_post.publish",
    postId: data.id,
    contentType: data.content_type,
    title: data.title,
    statusBefore: existing.status,
    statusAfter: data.status,
  });

  revalidateContentPostPages({ contentType: data.content_type, slug: data.slug });

  return sanitizeContentPostForAdmin(data);
}

export async function archiveAdminContentPost(supabase, { id, adminUserId, adminEmail }) {
  const existing = await loadMutablePost(supabase, id);

  const { data, error } = await supabase
    .from("content_posts")
    .update({
      status: "archived",
      updated_by: adminUserId || null,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(ADMIN_COLUMNS)
    .single();

  if (error) throw error;

  await logContentPostAudit(supabase, {
    adminUserId,
    adminEmail,
    action: "content_post.archive",
    postId: data.id,
    contentType: data.content_type,
    title: data.title,
    statusBefore: existing.status,
    statusAfter: data.status,
  });

  revalidateContentPostPages({ contentType: data.content_type, slug: data.slug });

  return sanitizeContentPostForAdmin(data);
}

export async function softDeleteAdminContentPost(supabase, { id, adminUserId, adminEmail }) {
  const existing = await loadMutablePost(supabase, id);

  const { data, error } = await supabase
    .from("content_posts")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: adminUserId || null,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(ADMIN_COLUMNS)
    .single();

  if (error) throw error;

  await logContentPostAudit(supabase, {
    adminUserId,
    adminEmail,
    action: "content_post.soft_delete",
    postId: data.id,
    contentType: data.content_type,
    title: data.title,
    statusBefore: existing.status,
    statusAfter: existing.status,
  });

  revalidateContentPostPages({ contentType: data.content_type, slug: data.slug });

  return sanitizeContentPostForAdmin(data);
}

export async function completeContentPostImageUpload(
  supabase,
  { postId, objectPath, mimeType, adminUserId, adminEmail }
) {
  const existing = await loadMutablePost(supabase, postId);
  assertContentImagePathOwnedByPost(objectPath, {
    contentType: existing.content_type,
    postId: existing.id,
  });

  const validation = await validateUploadedContentImageObject(supabase, objectPath, {
    declaredMime: mimeType || null,
  });
  if (!validation.ok) {
    throw Object.assign(new Error("ملف الصورة غير صالح"), {
      status: 400,
      code: validation.code || "INVALID_UPLOAD",
    });
  }

  const { data, error } = await supabase
    .from("content_posts")
    .update({
      image_path: objectPath,
      updated_by: adminUserId || null,
    })
    .eq("id", postId)
    .is("deleted_at", null)
    .select(ADMIN_COLUMNS)
    .single();

  if (error) throw error;

  await logContentPostAudit(supabase, {
    adminUserId,
    adminEmail,
    action: "content_post.update",
    postId: data.id,
    contentType: data.content_type,
    title: data.title,
    statusBefore: existing.status,
    statusAfter: data.status,
  });

  revalidateContentPostPages({ contentType: data.content_type, slug: data.slug });

  return sanitizeContentPostForAdmin(data);
}

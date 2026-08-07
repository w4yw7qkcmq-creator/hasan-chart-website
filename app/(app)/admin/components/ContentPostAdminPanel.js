"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ContentPostPreviewModal from "./ContentPostPreviewModal";
import { getCategoriesForContentType } from "../../../../lib/content-post-categories";
import { slugifyContentPostTitle } from "../../../../lib/content-post-slug-core";

const STATUS_OPTIONS = [
  { value: "", label: "كل الحالات" },
  { value: "draft", label: "مسودة" },
  { value: "published", label: "منشور" },
  { value: "archived", label: "مؤرشف" },
];

const EMPTY_FORM = {
  title: "",
  slug: "",
  summary: "",
  body: "",
  category: "",
  highlight_value: "",
};

const inputClassName =
  "w-full rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50";

function statusLabel(status) {
  switch (status) {
    case "published":
      return "منشور";
    case "archived":
      return "مؤرشف";
    default:
      return "مسودة";
  }
}

export default function ContentPostAdminPanel({ type = "academy" }) {
  const isResult = type === "result";
  const publicHref = isResult ? "/results" : "/academy";
  const pageTitle = isResult ? "Result Management" : "Academy Management";
  const pageTitleAr = isResult ? "إدارة HasaN CharT Result" : "إدارة HasaN CharT Academy";
  const categories = useMemo(() => getCategoriesForContentType(type), [type]);

  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewPost, setPreviewPost] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setFeedback({ type: "", message: "" });
    try {
      const params = new URLSearchParams({
        type,
        page: String(pagination.page || 1),
        pageSize: "20",
      });
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const response = await fetch(`/api/admin/content-posts?${params.toString()}`, {
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحميل المنشورات");
      }
      setPosts(result.posts || []);
      setPagination(result.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "تعذر تحميل المنشورات" });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, search, statusFilter, type]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
  };

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "title" && !editingId && !current.slug) {
        next.slug = slugifyContentPostTitle(value);
      }
      return next;
    });
  };

  const buildPayload = () => ({
    content_type: type,
    title: form.title,
    slug: form.slug || undefined,
    summary: form.summary,
    body: form.body,
    category: form.category || null,
    highlight_value: isResult ? form.highlight_value || null : null,
  });

  const uploadImageForPost = async (postId) => {
    if (!selectedFile) return null;

    const authorizeResponse = await fetch("/api/admin/content-posts/upload/authorize", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: postId,
        content_type: type,
        mime_type: selectedFile.type,
      }),
    });
    const authorizeResult = await authorizeResponse.json().catch(() => null);
    if (!authorizeResponse.ok || !authorizeResult?.success) {
      throw new Error(authorizeResult?.error || "تعذر تجهيز رفع الصورة");
    }

    const uploadResponse = await fetch(authorizeResult.upload.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": selectedFile.type,
        "x-upsert": "false",
      },
      body: selectedFile,
    });
    if (!uploadResponse.ok) {
      throw new Error("تعذر رفع الصورة");
    }

    const completeResponse = await fetch("/api/admin/content-posts/upload/complete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: postId,
        object_path: authorizeResult.upload.objectPath,
        mime_type: selectedFile.type,
      }),
    });
    const completeResult = await completeResponse.json().catch(() => null);
    if (!completeResponse.ok || !completeResult?.success) {
      throw new Error(completeResult?.error || "تعذر إتمام رفع الصورة");
    }
    return completeResult.post;
  };

  const saveDraft = async () => {
    setSubmitting(true);
    setFeedback({ type: "", message: "" });
    try {
      const payload = buildPayload();
      let post;

      if (editingId) {
        const response = await fetch(`/api/admin/content-posts/${editingId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "تعذر حفظ المسودة");
        }
        post = result.post;
      } else {
        const response = await fetch("/api/admin/content-posts", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "تعذر إنشاء المسودة");
        }
        post = result.post;
        setEditingId(post.id);
      }

      if (selectedFile) {
        post = await uploadImageForPost(post.id);
        setSelectedFile(null);
      }

      setFeedback({ type: "success", message: "تم حفظ المسودة" });
      await loadPosts();
      return post;
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "تعذر حفظ المسودة" });
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const publishPostById = async (postId) => {
    setSubmitting(true);
    setFeedback({ type: "", message: "" });
    try {
      const response = await fetch(`/api/admin/content-posts/${postId}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر نشر المنشور");
      }
      setFeedback({ type: "success", message: "تم نشر المنشور" });
      await loadPosts();
      return result.post;
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "تعذر نشر المنشور" });
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const publishPost = async () => {
    const saved = await saveDraft();
    if (!saved?.id) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/content-posts/${saved.id}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر نشر المنشور");
      }
      setFeedback({ type: "success", message: "تم نشر المنشور" });
      resetForm();
      await loadPosts();
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "تعذر نشر المنشور" });
    } finally {
      setSubmitting(false);
    }
  };

  const archivePost = async (postId) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/content-posts/${postId}/archive`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر أرشفة المنشور");
      }
      setFeedback({ type: "success", message: "تمت الأرشفة" });
      await loadPosts();
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "تعذر أرشفة المنشور" });
    } finally {
      setSubmitting(false);
    }
  };

  const deletePost = async (postId) => {
    if (!window.confirm("حذف المنشور؟ (حذف ناعم)")) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/content-posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر حذف المنشور");
      }
      if (editingId === postId) resetForm();
      setFeedback({ type: "success", message: "تم الحذف الناعم" });
      await loadPosts();
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "تعذر حذف المنشور" });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (post) => {
    setEditingId(post.id);
    setForm({
      title: post.title || "",
      slug: post.slug || "",
      summary: post.summary || "",
      body: post.body || "",
      category: post.category || "",
      highlight_value: post.highlight_value || "",
    });
    setSelectedFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openPreview = async () => {
    let basePost = editingId ? posts.find((item) => item.id === editingId) || null : null;
    if (!editingId) {
      basePost = await saveDraft();
    }
    const previewSource = {
      ...(basePost || {}),
      ...buildPayload(),
      id: editingId || basePost?.id,
      content_type: type,
      status: basePost?.status || "draft",
      image_path: basePost?.image_path || null,
    };
    setPreviewPost(previewSource);
    setPreviewOpen(true);
  };

  return (
    <section className="admin-theme-page space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-black text-cyan-300">{pageTitle}</p>
          <h1 className="text-3xl font-black text-white">{pageTitleAr}</h1>
          <p className="mt-2 text-slate-400">
            إنشاء وتحرير ونشر {isResult ? "نتائج HasaN CharT Result" : "دروس HasaN CharT Academy"} يدوياً.
          </p>
        </div>
        <Link
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex rounded-2xl border border-cyan-300/20 px-5 py-3 text-sm font-black text-cyan-200 no-underline"
        >
          عرض الصفحة العامة ↗
        </Link>
      </div>

      {feedback.message ? (
        <div
          className={`rounded-2xl px-4 py-3 text-sm font-bold ${
            feedback.type === "success" ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <form
          className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            saveDraft();
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-white">{editingId ? "تحرير منشور" : "منشور جديد"}</h2>
            {editingId ? (
              <button type="button" className="text-sm font-black text-slate-400" onClick={resetForm}>
                إلغاء التحرير
              </button>
            ) : null}
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-300">العنوان</span>
              <input className={inputClassName} value={form.title} onChange={(e) => updateField("title", e.target.value)} required />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-300">Slug</span>
              <input className={inputClassName} value={form.slug} onChange={(e) => updateField("slug", e.target.value)} dir="ltr" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-300">الملخص</span>
              <textarea className={inputClassName} rows={3} value={form.summary} onChange={(e) => updateField("summary", e.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-300">المحتوى</span>
              <textarea className={inputClassName} rows={10} value={form.body} onChange={(e) => updateField("body", e.target.value)} required />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-300">التصنيف</span>
              <select className={inputClassName} value={form.category} onChange={(e) => updateField("category", e.target.value)}>
                <option value="">بدون تصنيف</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            {isResult ? (
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-300">Highlight (اختياري)</span>
                <input
                  className={inputClassName}
                  value={form.highlight_value}
                  onChange={(e) => updateField("highlight_value", e.target.value)}
                  placeholder="+12% / TP2 Hit / Weekly Performance"
                />
              </label>
            ) : null}
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-300">الصورة</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={inputClassName}
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={submitting} className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950">
              حفظ مسودة
            </button>
            <button type="button" disabled={submitting} onClick={openPreview} className="rounded-2xl border border-cyan-300/20 px-5 py-3 text-sm font-black text-cyan-100">
              معاينة
            </button>
            <button type="button" disabled={submitting} onClick={publishPost} className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white">
              نشر
            </button>
          </div>
        </form>

        <div className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-6">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <select className={inputClassName} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className={inputClassName}
              placeholder="بحث بالعنوان"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <p className="text-slate-400">جاري التحميل...</p>
          ) : posts.length === 0 ? (
            <p className="text-slate-400">لا توجد منشورات بعد.</p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <div key={post.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white">{post.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {statusLabel(post.status)} · {post.slug}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black" onClick={() => startEdit(post)}>
                        تحرير
                      </button>
                      {post.status !== "published" ? (
                        <button
                          type="button"
                          className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white"
                          onClick={() => publishPostById(post.id)}
                        >
                          نشر
                        </button>
                      ) : (
                        <button type="button" className="rounded-xl border border-amber-300/20 px-3 py-2 text-xs font-black text-amber-200" onClick={() => archivePost(post.id)}>
                          أرشفة
                        </button>
                      )}
                      {post.status === "archived" ? (
                        <button
                          type="button"
                          className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950"
                          onClick={() => publishPostById(post.id)}
                        >
                          إعادة نشر
                        </button>
                      ) : null}
                      <button type="button" className="rounded-xl border border-rose-300/20 px-3 py-2 text-xs font-black text-rose-200" onClick={() => deletePost(post.id)}>
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ContentPostPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        post={previewPost}
        variant={type}
        listHref={publicHref}
      />
    </section>
  );
}

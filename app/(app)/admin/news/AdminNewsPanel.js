"use client";

import { useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../../lib/admin-fetch";
import { PermissionGate } from "../../../components/PermissionGate";
import NewsSystemStatusPanel from "./NewsSystemStatusPanel";

const EMPTY_FORM = {
  title: "",
  actual: "",
  forecast: "",
  previous: "",
  analysis: "",
};

export default function AdminNewsPanel() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handlePublish = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);

    try {
      const response = await adminFetch("/api/send-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر نشر الخبر");
      }

      setMessage("تم إرسال الخبر بنجاح");
      setForm(EMPTY_FORM);
    } catch (publishError) {
      setError(publishError?.message || "تعذر نشر الخبر");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-standalone-page admin-standalone-page--calm">
      <div className="admin-standalone-page__toolbar">
        <Link href="/admin" className="admin-standalone-back-link">
          ← العودة إلى لوحة الإدارة
        </Link>
      </div>

      <header className="admin-news-page__header">
        <p className="admin-user-hero__eyebrow">News Admin</p>
        <h1 className="admin-news-page__title">إدارة الأخبار</h1>
        <p className="admin-news-page__desc">
          مراجعة ونشر الأخبار الاقتصادية العاجلة عبر القناة المعتمدة.
        </p>
      </header>

      {error ? (
        <div className="admin-news-page__alert admin-news-page__alert--error" role="alert" aria-live="assertive">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="admin-news-page__alert admin-news-page__alert--success" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}

      <PermissionGate permission={IAM_PERMISSIONS.NEWS_READ}>
        <NewsSystemStatusPanel />
        <section className="admin-news-page__card" aria-labelledby="news-form-title">
          <h2 id="news-form-title" className="admin-news-page__card-title">
            نشر خبر اقتصادي
          </h2>

          <form className="admin-news-page__form" onSubmit={handlePublish}>
            <label className="admin-news-page__field">
              <span>عنوان الخبر</span>
              <input
                type="text"
                value={form.title}
                onChange={handleChange("title")}
                required
                autoComplete="off"
              />
            </label>
            <div className="admin-news-page__grid">
              <label className="admin-news-page__field">
                <span>الفعلي</span>
                <input type="text" value={form.actual} onChange={handleChange("actual")} autoComplete="off" />
              </label>
              <label className="admin-news-page__field">
                <span>المتوقع</span>
                <input type="text" value={form.forecast} onChange={handleChange("forecast")} autoComplete="off" />
              </label>
              <label className="admin-news-page__field">
                <span>السابق</span>
                <input type="text" value={form.previous} onChange={handleChange("previous")} autoComplete="off" />
              </label>
            </div>
            <label className="admin-news-page__field">
              <span>التحليل</span>
              <textarea value={form.analysis} onChange={handleChange("analysis")} rows={4} autoComplete="off" />
            </label>

            <PermissionGate
              permission={IAM_PERMISSIONS.NEWS_PUBLISH}
              fallback={
                <p className="admin-news-page__hint" role="status">
                  ليس لديك صلاحية نشر الأخبار. يمكنك مراجعة النموذج فقط.
                </p>
              }
            >
              <button type="submit" className="admin-news-page__submit" disabled={submitting}>
                {submitting ? "جاري النشر..." : "نشر الخبر"}
              </button>
            </PermissionGate>
          </form>
        </section>
      </PermissionGate>
    </div>
  );
}

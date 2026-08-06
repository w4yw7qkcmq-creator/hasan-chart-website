"use client";
import Link from "next/link";
import { useState } from "react";
const DIRECTION_OPTIONS = [
  { value: "bullish", label: "صاعد" },
  { value: "bearish", label: "هابط" },
  { value: "neutral", label: "محايد" },
];
const ANALYSIS_TYPE_OPTIONS = [
  { value: "daily", label: "يومي" },
  { value: "weekly", label: "أسبوعي" },
  { value: "urgent", label: "عاجل" },
];
const EMPTY_FORM = {
  title: "",
  symbol: "",
  direction: "neutral",
  analysisType: "daily",
  content: "",
  notes: "",
};
const inputClassName =
  "rounded-2xl border admin-panel-border admin-panel px-4 py-4 admin-text-muted outline-none placeholder:admin-text-subtle admin-field-focus";
export function DailyAnalysisPublishPanel() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [lastPublished, setLastPublished] = useState(null);
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback({ type: "", message: "" });
    try {
      const response = await fetch("/api/daily-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title,
          symbol: form.symbol,
          direction: form.direction,
          analysis_type: form.analysisType,
          content: form.content,
          notes: form.notes,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر نشر التحليل.");
      }
      setForm(EMPTY_FORM);
      setLastPublished(result.analysis || null);
      setFeedback({ type: "success", message: "تم نشر التحليل بنجاح" });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "حدث خطأ أثناء النشر.",
      });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section className="space-y-5">
      {" "}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        {" "}
        <div>
          {" "}
          <h2 className="text-3xl font-black admin-text">
            نشر تحليل يومي
          </h2>{" "}
          <p className="mt-2 admin-text-muted">
            {" "}
            أضف تحليلاً يومياً أو أسبوعياً أو عاجلاً ليظهر مباشرة في صفحة
            التحليلات اليومية.{" "}
          </p>{" "}
        </div>{" "}
        <Link
          href="/daily-analysis"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 rounded-2xl border admin-panel-border admin-panel px-5 py-3 text-sm font-black admin-text-muted no-underline transition hover:admin-panel"
        >
          {" "}
          عرض صفحة التحليلات اليومية ↗{" "}
        </Link>{" "}
      </div>{" "}
      <form
        onSubmit={handleSubmit}
        className="rounded-[30px] border admin-panel-border ui-glass-045 p-6 shadow-2xl backdrop-blur-2xl"
      >
        {" "}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {" "}
          <label className="block space-y-2">
            {" "}
            <span className="text-sm font-black admin-text-muted">
              العنوان
            </span>{" "}
            <input
              type="text"
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="مثال: تحليل BTC اليومي"
              required
              className={inputClassName}
            />{" "}
          </label>{" "}
          <label className="block space-y-2">
            {" "}
            <span className="text-sm font-black admin-text-muted">
              السوق / العملة
            </span>{" "}
            <input
              type="text"
              value={form.symbol}
              onChange={(event) => updateField("symbol", event.target.value)}
              placeholder="مثال: BTCUSDT أو GOLD"
              required
              className={inputClassName}
            />{" "}
          </label>{" "}
          <label className="block space-y-2">
            {" "}
            <span className="text-sm font-black admin-text-muted">
              الاتجاه
            </span>{" "}
            <UiSelect
              value={form.direction}
              onChange={(event) => updateField("direction", event.target.value)}
              className={inputClassName}
            >
              {" "}
              {DIRECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {" "}
                  {option.label}{" "}
                </option>
              ))}{" "}
            </UiSelect>{" "}
          </label>{" "}
          <label className="block space-y-2">
            {" "}
            <span className="text-sm font-black admin-text-muted">
              نوع التحليل
            </span>{" "}
            <UiSelect
              value={form.analysisType}
              onChange={(event) =>
                updateField("analysisType", event.target.value)
              }
              className={inputClassName}
            >
              {" "}
              {ANALYSIS_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {" "}
                  {option.label}{" "}
                </option>
              ))}{" "}
            </UiSelect>{" "}
          </label>{" "}
        </div>{" "}
        <label className="mt-4 block space-y-2">
          {" "}
          <span className="text-sm font-black admin-text-muted">
            نص التحليل الكامل
          </span>{" "}
          <textarea
            value={form.content}
            onChange={(event) => updateField("content", event.target.value)}
            placeholder="اكتب التحليل الكامل هنا..."
            required
            rows={8}
            className={`${inputClassName} min-h-40 w-full`}
          />{" "}
        </label>{" "}
        <label className="mt-4 block space-y-2">
          {" "}
          <span className="text-sm font-black admin-text-muted">
            ملاحظات اختيارية
          </span>{" "}
          <textarea
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            placeholder="ملاحظات إضافية للمتداولين..."
            rows={3}
            className={`${inputClassName} min-h-24 w-full`}
          />{" "}
        </label>{" "}
        {feedback.message ? (
          <p
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-black ${feedback.type === "success" ? "admin-feedback-success" : "admin-feedback-error"}`}
            role="status"
          >
            {" "}
            {feedback.message}{" "}
          </p>
        ) : null}{" "}
        {lastPublished?.title ? (
          <div className="mt-4 rounded-2xl border admin-panel-border admin-panel px-4 py-3 text-sm font-bold ui-public-seo-link-chip">
            {" "}
            آخر تحليل منشور:{" "}
            <strong className="admin-text">{lastPublished.title}</strong>{" "}
          </div>
        ) : null}{" "}
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 rounded-2xl admin-panel px-6 py-4 font-black admin-text shadow-[0_18px_50px_rgba(37,99,235,0.35)] transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {" "}
          {submitting ? "جاري النشر…" : "نشر التحليل"}{" "}
        </button>{" "}
      </form>{" "}
    </section>
  );
}

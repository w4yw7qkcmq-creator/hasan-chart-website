"use client";

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

export default function DailyAnalysisAdminForm({ onPublished }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

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
      setFeedback({ type: "success", message: "تم نشر التحليل بنجاح." });
      onPublished?.(result.analysis);
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
    <section className="daily-analysis-admin" aria-label="نشر تحليل يومي">
      <div className="daily-analysis-admin__head">
        <span className="daily-analysis-admin__badge">إدارة</span>
        <h2 className="daily-analysis-admin__title">نشر تحليل يومي</h2>
        <p className="daily-analysis-admin__text">هذا النموذج متاح للأدمن فقط.</p>
      </div>

      <form className="daily-analysis-admin__form" onSubmit={handleSubmit}>
        <div className="daily-analysis-admin__grid">
          <label className="daily-analysis-field">
            <span>العنوان</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="مثال: تحليل BTC اليومي"
              required
              className="daily-analysis-input"
            />
          </label>

          <label className="daily-analysis-field">
            <span>العملة / السوق</span>
            <input
              type="text"
              value={form.symbol}
              onChange={(event) => updateField("symbol", event.target.value)}
              placeholder="مثال: BTCUSDT أو GOLD"
              required
              className="daily-analysis-input"
            />
          </label>

          <label className="daily-analysis-field">
            <span>الاتجاه</span>
            <select
              value={form.direction}
              onChange={(event) => updateField("direction", event.target.value)}
              className="daily-analysis-input"
            >
              {DIRECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="daily-analysis-field">
            <span>نوع التحليل</span>
            <select
              value={form.analysisType}
              onChange={(event) => updateField("analysisType", event.target.value)}
              className="daily-analysis-input"
            >
              {ANALYSIS_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="daily-analysis-field">
          <span>نص التحليل الكامل</span>
          <textarea
            value={form.content}
            onChange={(event) => updateField("content", event.target.value)}
            placeholder="اكتب التحليل الكامل هنا..."
            required
            rows={8}
            className="daily-analysis-textarea"
          />
        </label>

        <label className="daily-analysis-field">
          <span>ملاحظات اختيارية</span>
          <textarea
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            placeholder="ملاحظات إضافية للمتداولين..."
            rows={3}
            className="daily-analysis-textarea"
          />
        </label>

        {feedback.message ? (
          <p
            className={`daily-analysis-admin__feedback ${
              feedback.type === "success"
                ? "daily-analysis-admin__feedback--success"
                : "daily-analysis-admin__feedback--error"
            }`}
            role="status"
          >
            {feedback.message}
          </p>
        ) : null}

        <button type="submit" disabled={submitting} className="daily-analysis-admin__submit">
          {submitting ? "جاري النشر…" : "نشر التحليل"}
        </button>
      </form>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

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

const DIRECTION_LABELS = Object.fromEntries(DIRECTION_OPTIONS.map((item) => [item.value, item.label]));
const ANALYSIS_TYPE_LABELS = Object.fromEntries(
  ANALYSIS_TYPE_OPTIONS.map((item) => [item.value, item.label])
);

const EMPTY_FORM = {
  title: "",
  symbol: "",
  direction: "neutral",
  analysisType: "daily",
  content: "",
  notes: "",
};

function formatAnalysisDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Damascus",
  }).format(date);
}

function AdminPublishForm({ onPublished }) {
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

function AnalysisSkeletonGrid() {
  return (
    <div className="daily-analysis-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="daily-analysis-card daily-analysis-card--skeleton">
          <div className="daily-analysis-skeleton daily-analysis-skeleton--lg" />
          <div className="daily-analysis-skeleton daily-analysis-skeleton--sm" />
          <div className="daily-analysis-skeleton daily-analysis-skeleton--md" />
          <div className="daily-analysis-skeleton daily-analysis-skeleton--full" />
        </div>
      ))}
    </div>
  );
}

function AnalysisCard({ item }) {
  const directionClass = `daily-analysis-card__direction daily-analysis-card__direction--${item.direction}`;

  return (
    <article className="daily-analysis-card">
      <div className="daily-analysis-card__head">
        <div className="daily-analysis-card__tags">
          <span className="daily-analysis-card__symbol">{item.symbol}</span>
          <span className={directionClass}>{DIRECTION_LABELS[item.direction] || item.direction}</span>
          <span className="daily-analysis-card__type">
            {ANALYSIS_TYPE_LABELS[item.analysisType] || item.analysisType}
          </span>
        </div>
        <time className="daily-analysis-card__date" dateTime={item.createdAt || undefined}>
          {formatAnalysisDate(item.createdAt)}
        </time>
      </div>

      <h2 className="daily-analysis-card__title">{item.title}</h2>

      <div className="daily-analysis-card__content">{item.content}</div>

      {item.notes ? (
        <div className="daily-analysis-card__notes">
          <strong>ملاحظات:</strong> {item.notes}
        </div>
      ) : null}

      <p className="daily-analysis-card__source">HasaN CharT World</p>
    </article>
  );
}

export default function DailyAnalysisPage() {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [canPublish, setCanPublish] = useState(false);
  const [adminAccessChecked, setAdminAccessChecked] = useState(false);

  const loadAnalyses = useCallback(async () => {
    try {
      setErrorMessage("");

      const response = await fetch("/api/daily-analysis", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحميل التحليلات.");
      }

      setAnalyses(Array.isArray(result.analyses) ? result.analyses : []);
    } catch (error) {
      setErrorMessage(error?.message || "حدث خطأ أثناء تحميل التحليلات.");
      setAnalyses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/daily-analysis/admin-access", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => response.json().catch(() => null))
      .then((result) => {
        if (!cancelled) {
          setCanPublish(Boolean(result?.success && result?.allowed));
        }
      })
      .catch(() => {
        if (!cancelled) setCanPublish(false);
      })
      .finally(() => {
        if (!cancelled) setAdminAccessChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePublished = (analysis) => {
    if (analysis?.id) {
      setAnalyses((current) => [analysis, ...current.filter((item) => item.id !== analysis.id)]);
      return;
    }

    loadAnalyses();
  };

  return (
    <main className="daily-analysis-page">
      <div className="daily-analysis-page__bg" aria-hidden="true" />

      <div className="daily-analysis-page__inner">
        {adminAccessChecked && canPublish ? (
          <AdminPublishForm onPublished={handlePublished} />
        ) : null}

        <header className="daily-analysis-hero">
          <span className="daily-analysis-hero__eyebrow">تحليلات HasaN CharT</span>
          <h1 className="daily-analysis-hero__title">التحليلات اليومية</h1>
          <p className="daily-analysis-hero__text">
            تحليلات يومية وأسبوعية وعاجلة للأسواق والعملات، بصيغة واضحة تساعدك على
            متابعة الاتجاه واتخاذ قرار أفضل.
          </p>
        </header>

        {loading ? (
          <AnalysisSkeletonGrid />
        ) : errorMessage ? (
          <div className="daily-analysis-state daily-analysis-state--error" role="alert">
            <span className="daily-analysis-state__icon" aria-hidden="true">
              ⚠️
            </span>
            <h2 className="daily-analysis-state__title">تعذر تحميل التحليلات</h2>
            <p className="daily-analysis-state__text">{errorMessage}</p>
            <button type="button" onClick={loadAnalyses} className="daily-analysis-state__action">
              إعادة المحاولة
            </button>
          </div>
        ) : analyses.length === 0 ? (
          <div className="daily-analysis-state">
            <span className="daily-analysis-state__icon" aria-hidden="true">
              📝
            </span>
            <h2 className="daily-analysis-state__title">لا توجد تحليلات يومية حالياً</h2>
            <p className="daily-analysis-state__text">
              سيتم عرض أحدث التحليلات هنا فور نشرها من الإدارة.
            </p>
          </div>
        ) : (
          <section className="daily-analysis-grid" aria-label="قائمة التحليلات">
            {analyses.map((item) => (
              <AnalysisCard key={item.id} item={item} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

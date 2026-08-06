"use client";
import { useState } from "react";
import Link from "next/link";
import SuccessModal from "../../../components/SuccessModal";
import Breadcrumbs from "../../../components/seo/Breadcrumbs";
import {
  ANALYSIS_REQUEST_ASSET_LINKS,
  ANALYSIS_REQUEST_HUB_LINKS,
} from "./analysisRequestHelpers";
const PAGE_BREADCRUMBS = [
  { label: "الرئيسية", href: "/" },
  { label: "طلب تحليل", href: "/analysis/request" },
];
function HubLinks({ title = "روابط مفيدة" }) {
  return (
    <nav className="analysis-request-hub" aria-label={title}>
      {" "}
      <h2 className="analysis-request-hub__title">{title}</h2>{" "}
      <div className="analysis-request-hub__grid">
        {" "}
        {ANALYSIS_REQUEST_HUB_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="analysis-request-hub__link"
          >
            {" "}
            {link.label}{" "}
          </Link>
        ))}{" "}
      </div>{" "}
    </nav>
  );
}
function AssetQuickLinks() {
  return (
    <nav className="analysis-request-assets" aria-label="أصول سريعة">
      {" "}
      <h2 className="analysis-request-assets__title">أصول وأسواق سريعة</h2>{" "}
      <div className="analysis-request-assets__grid">
        {" "}
        {ANALYSIS_REQUEST_ASSET_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="analysis-request-assets__link"
          >
            {" "}
            {link.label}{" "}
          </Link>
        ))}{" "}
      </div>{" "}
    </nav>
  );
}
export default function AnalysisRequestAuthenticated() {
  const [coin, setCoin] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inlineStatus, setInlineStatus] = useState({ type: "", message: "" });
  const [modal, setModal] = useState({
    open: false,
    type: "success",
    title: "تم إرسال الطلب بنجاح",
    message: "تم إرسال طلب التحليل وسيتم إعلامك عند جاهزية النتيجة.",
  });
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setInlineStatus({ type: "", message: "" });
    try {
      const response = await fetch("/api/analysis-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coin: coin.trim().toUpperCase(),
          frame: timeframe.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          result.error ||
          "حدث خطأ أثناء إرسال طلب التحليل، يرجى المحاولة مرة أخرى.";
        setInlineStatus({ type: "error", message });
        setModal({
          open: true,
          type: "error",
          title: "تعذر إرسال الطلب",
          message,
        });
        return;
      }
      setCoin("");
      setTimeframe("");
      setInlineStatus({
        type: "success",
        message: "تم إرسال طلب التحليل بنجاح. سيتم إعلامك عند جاهزية النتيجة.",
      });
      setModal({
        open: true,
        type: "success",
        title: "تم إرسال الطلب بنجاح",
        message: "تم إرسال طلب التحليل وسيتم إعلامك عند جاهزية النتيجة.",
      });
    } catch {
      const message = "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.";
      setInlineStatus({ type: "error", message });
      setModal({
        open: true,
        type: "error",
        title: "تعذر إرسال الطلب",
        message,
      });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="analysis-request-page">
      {" "}
      <div className="analysis-request-page__bg" aria-hidden="true" />{" "}
      <div className="analysis-request-page__inner">
        {" "}
        <SuccessModal
          open={modal.open}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={() => setModal((current) => ({ ...current, open: false }))}
        />{" "}
        <div className="analysis-request-breadcrumb">
          {" "}
          <Breadcrumbs items={PAGE_BREADCRUMBS} variant="dark" />{" "}
        </div>{" "}
        <header className="analysis-request-hero">
          {" "}
          <span className="analysis-request-hero__eyebrow">
            تحليل مخصص من الخبراء
          </span>{" "}
          <h1 className="analysis-request-hero__title">طلب تحليل</h1>{" "}
          <p className="analysis-request-hero__text">
            {" "}
            اطلب تحليلاً مفصلاً لأصل أو زوج محدد من خبراء HasaN CharT World.
            التحليل الاحترافي يصدر من فريق بشري، والذكاء الاصطناعي أداة مساعدة
            منفصلة عند طلبها صراحةً.{" "}
          </p>{" "}
        </header>{" "}
        <section className="analysis-request-note">
          {" "}
          <p>
            {" "}
            املأ الزوج والفريم المطلوبين بدقة. سيصلك التحليل داخل المنصة بعد
            مراجعته من الفريق.{" "}
          </p>{" "}
        </section>{" "}
        <section
          className="analysis-request-form-card"
          aria-label="نموذج طلب التحليل"
        >
          {" "}
          {inlineStatus.message ? (
            <div
              className={`analysis-request-status analysis-request-status--${inlineStatus.type}`}
              role="status"
            >
              {" "}
              {inlineStatus.message}{" "}
            </div>
          ) : null}{" "}
          <form onSubmit={handleSubmit} className="analysis-request-form">
            {" "}
            <label className="analysis-request-field">
              {" "}
              <span>العملة / الزوج</span>{" "}
              <input
                type="text"
                value={coin}
                onChange={(e) => setCoin(e.target.value)}
                placeholder="مثال: BTCUSDT أو XAUUSD"
                required
                className="analysis-request-input"
              />{" "}
            </label>{" "}
            <label className="analysis-request-field">
              {" "}
              <span>الفريم المطلوب</span>{" "}
              <input
                type="text"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                placeholder="15m / 1h / 4h / 1d"
                required
                className="analysis-request-input"
              />{" "}
            </label>{" "}
            <button
              type="submit"
              disabled={submitting}
              className="analysis-request-submit"
            >
              {" "}
              {submitting ? "جاري الإرسال…" : "إرسال الطلب"}{" "}
            </button>{" "}
          </form>{" "}
        </section>{" "}
        <AssetQuickLinks /> <HubLinks />{" "}
      </div>{" "}
    </main>
  );
}

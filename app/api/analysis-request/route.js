import React, { useState, useEffect } from "react";

export default function Home() {
  const [successModal, setSuccessModal] = useState(null);
  const [canRequestAnalysis, setCanRequestAnalysis] = useState(true);
  const [analysisCooldownText, setAnalysisCooldownText] = useState("");
  const [analysisSubmitting, setAnalysisSubmitting] = useState(false);

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (text) => {
      if (text.includes("تم استلام طلب التحليل")) {
        setSuccessModal({
          title: "تم استلام طلب التحليل بنجاح",
          message: "سيتم مراجعة طلبك وإرسال الرد من الإدارة قريبًا.",
        });
        return;
      }
      if (text.includes("يمكنك إرسال طلب تحليل جديد بعد")) {
        setCanRequestAnalysis(false);
        setAnalysisCooldownText(text);
        return;
      }
      originalAlert(text);
    };

    return () => {
      window.alert = originalAlert;
    };
  }, []);

  async function submitAnalysis(data) {
    setAnalysisSubmitting(true);
    try {
      const response = await fetch("/api/analysis-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        if (response.status === 429 && result?.error) {
          setCanRequestAnalysis(false);
          setAnalysisCooldownText(result.error);
          return;
        }

        throw new Error(result?.error || `فشل إرسال طلب التحليل. كود الخطأ: ${response.status}`);
      }

      window.alert("تم استلام طلب التحليل بنجاح");
    } catch (error) {
      window.alert(error.message);
    } finally {
      setAnalysisSubmitting(false);
    }
  }

  return (
    <div>
      {/* Other UI elements */}
      <button
        disabled={analysisSubmitting || !canRequestAnalysis}
        onClick={() => submitAnalysis({ user_email: "user@example.com", coin: "BTC", frame: "1D" })}
      >
        {analysisSubmitting ? "جاري إرسال الطلب..." : "إرسال طلب التحليل"}
      </button>
      {analysisCooldownText && (
        <div className="mt-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-center text-sm font-bold leading-7 text-blue-100 shadow-[0_0_18px_rgba(59,130,246,0.18)]">
          {analysisCooldownText}
        </div>
      )}
      {successModal && (
        <div className="modal">
          <h2>{successModal.title}</h2>
          <p>{successModal.message}</p>
          <button onClick={() => setSuccessModal(null)}>إغلاق</button>
        </div>
      )}
    </div>
  );
}